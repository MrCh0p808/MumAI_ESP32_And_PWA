import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, RotateCcw, CheckCircle2, ShieldCheck, X, Volume2, Sparkles, AlertCircle } from 'lucide-react';
import { VoiceprintRecorder, RecordingResult } from '../lib/audioRecorder';
import { agentService } from '../services/agentService';
import { saveVoiceprint } from '../lib/db';

interface VoiceprintOnboardingModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: (voiceprintUrl: string) => void;
  existingVoiceprintUrl?: string | null;
}

export function VoiceprintOnboardingModal({
  userId,
  isOpen,
  onClose,
  onEnrolled,
  existingVoiceprintUrl
}: VoiceprintOnboardingModalProps) {
  const [step, setStep] = useState<'intro' | 'recording' | 'review' | 'uploading' | 'success'>('intro');
  const [secondsLeft, setSecondsLeft] = useState(6);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [recordingResult, setRecordingResult] = useState<RecordingResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhraseIndex, setSelectedPhraseIndex] = useState(0);

  const recorderRef = useRef<VoiceprintRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const calibrationPhrases = [
    {
      hinglish: "Namaste Maa, main aa gaya hoon, meri aawaz pehchan lo.",
      hindi: "नमस्ते माँ, मैं आ गया हूँ, मेरी आवाज़ पहचान लो।",
      english: "Hello Maa, I am home, please recognize my voice."
    },
    {
      hinglish: "Maa, aaj ka din kaisa raha? Main theek hoon.",
      hindi: "माँ, आज का दिन कैसा रहा? मैं ठीक हूँ।",
      english: "Maa, how was your day today? I am doing well."
    }
  ];

  useEffect(() => {
    if (!isOpen) {
      if (recorderRef.current) {
        recorderRef.current.cancel();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setStep('intro');
      setRecordingResult(null);
      setError(null);
      setIsPlaying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const startCalibrationRecording = async () => {
    try {
      setError(null);
      setStep('recording');
      setSecondsLeft(6);
      setVolumeLevel(0);

      recorderRef.current = new VoiceprintRecorder();
      const result = await recorderRef.current.startRecording(6000, (left, vol) => {
        setSecondsLeft(left);
        setVolumeLevel(vol);
      });

      setRecordingResult(result);
      setStep('review');
    } catch (err: any) {
      console.error("Recording error:", err);
      setError(err?.message || "Microphone access failed. Please allow microphone permissions.");
      setStep('intro');
    }
  };

  const togglePlayback = () => {
    if (!recordingResult) return;

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(recordingResult.wavUrl);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleEnrollAndSave = async () => {
    if (!recordingResult) return;

    try {
      setStep('uploading');
      setError(null);

      // 1. Upload 16kHz PCM file to backend
      const uploadRes = await agentService.uploadVoiceprint(userId, recordingResult.pcmBase64);

      // 2. Persist voiceprint URL in Firestore
      try {
        await saveVoiceprint(userId, uploadRes.voiceprintUrl);
      } catch (dbErr) {
        console.warn("Firestore voiceprint record updated locally:", dbErr);
      }

      // 3. Cache locally
      localStorage.setItem(`mumai_voiceprint_${userId}`, uploadRes.voiceprintUrl);

      setStep('success');
      setTimeout(() => {
        onEnrolled(uploadRes.voiceprintUrl);
        onClose();
      }, 1500);
    } catch (uploadErr: any) {
      console.error("Enrollment upload error:", uploadErr);
      setError(uploadErr?.message || "Failed to upload voiceprint. Please try again.");
      setStep('review');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-slate-900/95 border border-cyan-500/20 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 text-slate-100 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          title="Dismiss"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow-inner">
            <ShieldCheck size={22} strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              Voice Print Acceptance
              <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Agora SAL
              </span>
            </h2>
            <p className="text-xs text-slate-400">Lock Maa's attention solely to your voice signature</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Step: Intro */}
        {step === 'intro' && (
          <div>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Just like an Indian mother recognizes her child's voice even in a crowded bazaar, 
              Maa uses <strong className="text-cyan-300 font-medium">Selective Attention Locking (SAL)</strong> to 
              filter out background chatter and TV sounds.
            </p>

            {existingVoiceprintUrl && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 size={15} /> Current Voiceprint Active
                </span>
                <span className="text-[11px] text-emerald-400/80 underline cursor-pointer" onClick={startCalibrationRecording}>
                  Re-calibrate
                </span>
              </div>
            )}

            {/* Calibration Phrase Selection */}
            <div className="bg-slate-950/60 rounded-2xl p-4 border border-white/5 mb-6">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium flex items-center gap-1.5">
                  <Sparkles size={13} className="text-cyan-400" /> Speak this 6-second sentence:
                </span>
                <span className="font-mono text-[10px] text-slate-500">Phrase {selectedPhraseIndex + 1}/{calibrationPhrases.length}</span>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-base font-medium text-cyan-200 tracking-wide mb-1">
                  "{calibrationPhrases[selectedPhraseIndex].hinglish}"
                </p>
                <p className="text-xs text-slate-400">
                  {calibrationPhrases[selectedPhraseIndex].hindi}
                </p>
              </div>

              <div className="flex gap-2 mt-3">
                {calibrationPhrases.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedPhraseIndex(idx)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${
                      selectedPhraseIndex === idx
                        ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Phrase {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={startCalibrationRecording}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-medium text-sm transition-all shadow-lg shadow-cyan-600/25 border border-cyan-400/30"
              >
                <Mic size={18} />
                Record Voice Sample (6s)
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-colors text-center"
              >
                Skip for now (Maa will use Dynamic Locking)
              </button>
            </div>
          </div>
        )}

        {/* Step: Recording */}
        {step === 'recording' && (
          <div className="text-center py-6">
            <div className="relative w-28 h-28 mx-auto mb-6 flex items-center justify-center">
              {/* Animated ripple circle */}
              <div 
                className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping"
                style={{ animationDuration: '1.2s' }}
              />
              <div 
                className="absolute inset-2 rounded-full bg-rose-500/30 transition-transform duration-100"
                style={{ transform: `scale(${1 + (volumeLevel / 150)})` }}
              />
              <div className="relative z-10 w-20 h-20 rounded-full bg-rose-600 text-white flex flex-col items-center justify-center shadow-xl border border-rose-400/40">
                <Mic size={26} className="animate-pulse" />
                <span className="text-xs font-mono font-bold mt-1">{secondsLeft}s</span>
              </div>
            </div>

            <p className="text-xs font-mono uppercase tracking-widest text-rose-400 mb-2">Recording Calibration Sample...</p>
            
            {/* Live sentence to read */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-white/10 max-w-sm mx-auto mb-6">
              <p className="text-sm font-medium text-slate-100 mb-1 leading-relaxed">
                "{calibrationPhrases[selectedPhraseIndex].hinglish}"
              </p>
              <p className="text-xs text-slate-400">
                {calibrationPhrases[selectedPhraseIndex].hindi}
              </p>
            </div>

            {/* Dynamic VU Meter */}
            <div className="flex items-center justify-center gap-1.5 h-8 mb-4">
              {[...Array(16)].map((_, i) => {
                const threshold = (i / 16) * 100;
                const active = volumeLevel > threshold;
                return (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all duration-75 ${
                      active ? 'bg-cyan-400 h-6' : 'bg-slate-700 h-2'
                    }`}
                  />
                );
              })}
            </div>

            <button
              onClick={() => {
                if (recorderRef.current) recorderRef.current.cancel();
                setStep('intro');
              }}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
            >
              Cancel Recording
            </button>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && recordingResult && (
          <div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Volume2 size={15} className="text-cyan-400" /> Recorded Sample Ready
                </span>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-md border border-cyan-800/40">
                  16kHz Mono PCM
                </span>
              </div>

              {/* Audio Playback Controls */}
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                <button
                  onClick={togglePlayback}
                  className="w-10 h-10 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 flex items-center justify-center transition-all shadow-md shrink-0"
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-200">
                    {isPlaying ? "Playing sample..." : "Tap play to verify clarity"}
                  </p>
                  <p className="text-[11px] text-slate-400">Duration: {recordingResult.durationSeconds} seconds</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={startCalibrationRecording}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition-all"
              >
                <RotateCcw size={15} /> Re-record
              </button>

              <button
                onClick={handleEnrollAndSave}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-medium text-xs transition-all shadow-lg shadow-cyan-600/20 border border-cyan-400/30"
              >
                <CheckCircle2 size={15} /> Enroll Voiceprint
              </button>
            </div>
          </div>
        )}

        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="py-10 text-center">
            <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-200 mb-1">Enrolling Voice Signature</p>
            <p className="text-xs text-slate-400">Configuring Agora Selective Attention Lock on server...</p>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="py-8 text-center animate-in zoom-in duration-200">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} />
            </div>
            <h3 className="text-base font-semibold text-slate-100 mb-1">Voiceprint Accepted!</h3>
            <p className="text-xs text-slate-300 max-w-xs mx-auto">
              Maa has locked onto your voice signature. Background noise and extraneous speakers will now be ignored.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
