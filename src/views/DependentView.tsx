import { useState, useEffect } from 'react';
import { Mic, MicOff, ShieldCheck, AlertTriangle, Sparkles, Volume2, Fingerprint } from 'lucide-react';
import { FluidOrb } from '../components/FluidOrb';
import { useMumAI } from '../hooks/useMumAI';
import { motion, AnimatePresence } from 'motion/react';
import { VoiceprintOnboardingModal } from '../components/VoiceprintOnboardingModal';
import { agentService } from '../services/agentService';
import { getUserVoiceprint } from '../lib/db';

export function DependentView({ userId }: { userId: string }) {
  const [voiceprintUrl, setVoiceprintUrl] = useState<string | null>(null);
  const [isVoiceprintModalOpen, setIsVoiceprintModalOpen] = useState(false);
  const [checkedVoiceprint, setCheckedVoiceprint] = useState(false);

  const { state, volume, toggleListening, triggerSOS, micPermissionError, clearMicPermissionError } = useMumAI('dependent', userId, voiceprintUrl);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [sosConfirmed, setSosConfirmed] = useState(false);

  // Check voiceprint enrollment status on mount
  useEffect(() => {
    async function loadVoiceprint() {
      try {
        // 1. Check local storage
        const cached = localStorage.getItem(`mumai_voiceprint_${userId}`);
        if (cached) {
          setVoiceprintUrl(cached);
          setCheckedVoiceprint(true);
          return;
        }

        // 2. Check Firestore
        const dbUrl = await getUserVoiceprint(userId);
        if (dbUrl) {
          setVoiceprintUrl(dbUrl);
          localStorage.setItem(`mumai_voiceprint_${userId}`, dbUrl);
          setCheckedVoiceprint(true);
          return;
        }

        // 3. Check disk file via backend
        const diskStatus = await agentService.checkVoiceprint(userId);
        if (diskStatus.hasVoiceprint && diskStatus.voiceprintUrl) {
          setVoiceprintUrl(diskStatus.voiceprintUrl);
          localStorage.setItem(`mumai_voiceprint_${userId}`, diskStatus.voiceprintUrl);
        }
      } catch (err) {
        console.warn("Could not check voiceprint status:", err);
      } finally {
        setCheckedVoiceprint(true);
      }
    }
    loadVoiceprint();
  }, [userId]);

  // Check if browser has audio permission or if user hasn't explicitly initialized
  const handleConnectWithPermission = () => {
    setPermissionRequested(true);
    toggleListening();
  };

  const handleSosClick = () => {
    triggerSOS();
    setSosConfirmed(true);
    setTimeout(() => setSosConfirmed(false), 4000);
  };

  // Compute 5 dynamic bars for the voice activity VU meter
  const vuLevels = [
    Math.min(100, Math.max(12, volume * 1.3)),
    Math.min(100, Math.max(16, volume * 1.1)),
    Math.min(100, Math.max(20, volume * 1.5)),
    Math.min(100, Math.max(16, volume * 1.2)),
    Math.min(100, Math.max(12, volume * 1.0))
  ];

  return (
    <div className="flex-1 flex flex-col justify-between items-center px-6 bg-[#0B0F19] overflow-hidden relative select-none">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full blur-[140px] transition-colors duration-1000 ${
          state === 'speaking' 
            ? 'bg-emerald-900/20' 
            : state === 'thinking' 
            ? 'bg-amber-900/20' 
            : state === 'listening' 
            ? 'bg-sky-900/20' 
            : 'bg-slate-900/10'
        }`} />
      </div>

      {/* Top Header & State Bar */}
      <div className="w-full mt-10 flex flex-col items-center z-10 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs tracking-widest uppercase text-slate-400 font-semibold">
            Maa Companion
          </span>
          <button
            onClick={() => setIsVoiceprintModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
              voiceprintUrl
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 animate-pulse'
            }`}
            title="Configure Selective Attention Voiceprint"
          >
            {voiceprintUrl ? (
              <>
                <ShieldCheck size={13} /> Voiceprint Enrolled (SAL Active)
              </>
            ) : (
              <>
                <Fingerprint size={13} /> Enroll Voiceprint (6s)
              </>
            )}
          </button>
        </div>

        {/* State Indicator Pill */}
        <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700/60 shadow-lg">
          <div className={`w-2.5 h-2.5 rounded-full ${
            state === 'error' 
              ? 'bg-rose-500 animate-pulse' 
              : state === 'speaking'
              ? 'bg-emerald-400 animate-pulse'
              : state === 'thinking'
              ? 'bg-amber-400 animate-pulse'
              : state === 'listening'
              ? 'bg-sky-400 animate-pulse' 
              : 'bg-slate-600'
          }`} />
          <p className="text-sm font-medium text-slate-200">
            {state === 'idle' 
              ? 'Standby — Ready to listen' 
              : state === 'listening' 
              ? 'Listening... Speak in Hindi or English' 
              : state === 'thinking' 
              ? 'Maa is thinking...' 
              : state === 'speaking' 
              ? 'Maa is speaking' 
              : 'Connection retry needed'}
          </p>
        </div>

        {/* Real-time Voice Activity VU Meter */}
        {state !== 'idle' && (
          <div className="flex items-center gap-1.5 pt-2">
            <Volume2 size={13} className="text-slate-500" />
            <div className="flex items-end gap-1 h-5 px-2">
              {vuLevels.map((lvl, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    state === 'speaking'
                      ? 'bg-emerald-400'
                      : state === 'thinking'
                      ? 'bg-amber-400'
                      : 'bg-sky-400'
                  }`}
                  style={{
                    height: `${lvl}%`,
                    opacity: Math.max(0.3, lvl / 100)
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {volume > 0 ? `${volume} VU` : 'ambient'}
            </span>
          </div>
        )}
      </div>

      {/* Center Fluid Orb Visualizer */}
      <div className="w-full flex-1 flex items-center justify-center z-10">
        <FluidOrb state={state} volume={volume} />
      </div>

      {/* Microphone Permission Blocked Interactive Guide */}
      <AnimatePresence>
        {micPermissionError && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="w-full max-w-md mx-auto mb-6 p-5 rounded-2xl bg-rose-950/90 border border-rose-500/50 backdrop-blur-xl shadow-2xl z-30"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 mt-0.5 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-rose-100 flex items-center gap-2">
                  Microphone Access Blocked
                </h3>
                <p className="text-xs text-rose-200 mt-1.5 leading-relaxed">
                  Your browser blocked access to the microphone. To talk with Maa:
                </p>
                <ol className="text-xs text-rose-300 mt-2 space-y-1 list-decimal list-inside bg-rose-900/30 p-2.5 rounded-xl border border-rose-500/20">
                  <li>Click the <strong>🔒 Lock / 🎛️ Settings</strong> icon in your browser address bar.</li>
                  <li>Toggle <strong>Microphone</strong> to <strong>Allow</strong>.</li>
                  <li>Click <strong>Retry Connection</strong> below.</li>
                </ol>
                <div className="mt-4 flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      clearMicPermissionError();
                      toggleListening();
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white text-xs font-semibold shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2"
                  >
                    <Mic size={16} /> Retry Connection
                  </button>
                  <button
                    onClick={clearMicPermissionError}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:text-white transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pre-Interaction Microphone Permission & Voiceprint Modal / Card */}
      <AnimatePresence>
        {!permissionRequested && state === 'idle' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-md mx-auto mb-6 p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 backdrop-blur-xl shadow-2xl z-20"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 mt-0.5">
                <Sparkles size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-100">Namaste! Talk directly with Maa</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Natural hands-free conversations in Hindi and English.
                  {!voiceprintUrl && (
                    <span className="block mt-1 text-cyan-300 font-medium">
                      Tip: Calibrate your voiceprint so Maa locks onto your voice even in noisy rooms.
                    </span>
                  )}
                </p>
                <div className="mt-4 flex items-center gap-2.5">
                  <button
                    onClick={handleConnectWithPermission}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2"
                  >
                    <Mic size={16} /> Allow Mic & Connect
                  </button>
                  {!voiceprintUrl && (
                    <button
                      onClick={() => setIsVoiceprintModalOpen(true)}
                      className="px-3.5 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      <Fingerprint size={14} /> Voiceprint
                    </button>
                  )}
                  <button
                    onClick={() => setPermissionRequested(true)}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-medium hover:text-slate-200 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voiceprint Onboarding Modal */}
      <VoiceprintOnboardingModal
        userId={userId}
        isOpen={isVoiceprintModalOpen}
        onClose={() => setIsVoiceprintModalOpen(false)}
        existingVoiceprintUrl={voiceprintUrl}
        onEnrolled={(url) => {
          setVoiceprintUrl(url);
        }}
      />

      {/* Bottom Controls: Tap to Connect/Mute + Emergency SOS */}
      <div className="pb-12 pt-4 w-full flex flex-col items-center z-10 space-y-4">
        <div className="flex items-center gap-6">
          {/* Main Voice Toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleListening}
            className={`relative flex items-center justify-center w-20 h-20 rounded-full shadow-2xl transition-all duration-300 ${
              state === 'idle'
                ? 'bg-slate-800/90 backdrop-blur-xl border border-slate-700 hover:bg-slate-700/80 text-cyan-400'
                : 'bg-rose-500/15 backdrop-blur-xl border border-rose-500/50 hover:bg-rose-500/25 text-rose-400'
            }`}
            aria-label={state === 'idle' ? "Connect to Maa" : "Pause Conversation"}
          >
            {state !== 'idle' && (
              <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
            )}
            
            {state === 'idle' ? (
              <Mic size={32} strokeWidth={1.75} />
            ) : (
              <MicOff size={32} strokeWidth={1.75} />
            )}
          </motion.button>

          {/* Emergency SOS Button for Elder Safety */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSosClick}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-full border transition-all shadow-lg ${
              sosConfirmed 
                ? 'bg-rose-600 border-rose-400 text-white animate-pulse' 
                : 'bg-slate-900/80 border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-400'
            }`}
            aria-label="Emergency SOS Alert"
          >
            <AlertTriangle size={22} />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">
              {sosConfirmed ? 'Sent!' : 'SOS'}
            </span>
          </motion.button>
        </div>

        <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">
          {state === 'idle' ? 'Always-Listening Standby — Tap to Activate' : 'Active Voice Loop — Tap to Pause'}
        </p>
      </div>
    </div>
  );
}
