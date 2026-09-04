import { useState, useCallback, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { agoraRtm, CHANNEL_NAME } from '../lib/agoraRtm';
import { AgentState, TelemetryMetrics, MemoryRecord, TranscriptMessage } from '../types';
import { UserRole, logMemory, subscribeToMemories } from '../lib/db';
import { telemetryService } from '../services/telemetryService';
import { agentService } from '../services/agentService';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || 'd6289000c1bc4e0d9247e44a3b33c138';

export function useMumAI(
  userRole: UserRole = 'dependent', 
  userId: string | null = null,
  voiceprintUrl: string | null = null
) {
  const [state, setState] = useState<AgentState>('idle');
  const [volume, setVolume] = useState<number>(0);
  const [metrics, setMetrics] = useState<TelemetryMetrics>({
    jitterPct: 0.8,
    shimmerDb: 2.1,
    latencyMs: 0,
    connected: false,
    batteryPct: 100,
  });
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);

  const rtcClient = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
  const isDependent = userRole === 'dependent';
  const turnStartTimeRef = useRef<number>(0);

  useEffect(() => {
    let unsubscribeMemories: (() => void) | undefined;
    
    // Subscribe to Firestore memories
    if (userId || userRole === 'caregiver') {
      const targetId = isDependent ? userId : null;
      unsubscribeMemories = subscribeToMemories(targetId, (newMemories) => {
        setMemories(newMemories);
      });
    }

    // Subscribe to incoming RTM events via Singleton listener
    const removeRtmListener = agoraRtm.addMessageListener((type, data) => {
      if (type === 'transcript') {
        const text = data.message?.text || data.text;
        const rawRole = data.message?.role || data.role;
        const role = rawRole === 'assistant' ? 'agent' : (rawRole || 'agent');
        if (text) {
          const newMsg: TranscriptMessage = {
            id: data.message?.id || data.turn_id?.toString() || Date.now().toString(),
            role,
            text,
            timestamp: new Date()
          };
          setTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.text === text && last.role === role) return prev;
            return [...prev, newMsg];
          });
          agentService.submitTurnTranscript(CHANNEL_NAME, text, role);
        }
      } else if (type === 'state') {
        if (data.state) {
          setState(data.state);
        }
      } else if (type === 'metrics') {
        if (data.metrics) {
          setMetrics(prev => ({ ...prev, ...data.metrics }));
        }
      }
    });

    // If caregiver, auto-connect to RTM singleton as subscriber
    if (userRole === 'caregiver') {
      agoraRtm.initOrGet('subscriber')
        .then(() => {
          setMetrics(m => ({ ...m, connected: true }));
        })
        .catch((e) => console.error("RTM subscriber init error:", e));
    }

    return () => {
      removeRtmListener();
      if (unsubscribeMemories) unsubscribeMemories();
    };
  }, [userRole, userId, isDependent]);

  const cleanupMedia = async () => {
    if (localAudioTrack.current) {
      try {
        localAudioTrack.current.stop();
        localAudioTrack.current.close();
      } catch (e) {}
      localAudioTrack.current = null;
    }
    if (rtcClient.current) {
      try {
        await rtcClient.current.leave();
      } catch (e) {}
      rtcClient.current = null;
    }
  };

  const broadcastRTM = async (type: string, payload: any) => {
    await agoraRtm.publish(type, payload);
  };

  const startCall = async () => {
    if (!APP_ID) {
      console.error("VITE_AGORA_APP_ID is not set in environment variables");
      return;
    }

    try {
      await cleanupMedia();

      setState('thinking');
      telemetryService.startSession(CHANNEL_NAME, userId || undefined);
      
      rtcClient.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // Enable volume indicator to drive the fluid orb & VU meter
      rtcClient.current.enableAudioVolumeIndicator();
      rtcClient.current.on("volume-indicator", (volumes) => {
        let maxVol = 0;
        volumes.forEach((v) => {
          if (v.level > maxVol) maxVol = v.level;
        });
        setVolume(maxVol);

        // Detect user barge-in if dependent speaks during agent speech
        if (maxVol > 45 && state === 'speaking') {
          telemetryService.logEvent({ type: 'barge_in' });
        }
      });

      rtcClient.current.on('user-published', async (user, mediaType) => {
        console.log(`[Agora RTC] Remote user published: UID=${user.uid}, mediaType=${mediaType}`);
        try {
          await rtcClient.current?.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            console.log(`[Agora RTC] Subscribed to remote audio track for UID=${user.uid}`);
            if (user.audioTrack) {
              user.audioTrack.setVolume(100);
              try {
                user.audioTrack.play();
                console.log(`[Agora RTC] Audio track playback started for UID=${user.uid}`);
              } catch (playErr) {
                console.warn('[Agora RTC] Direct audio playback failed (browser autoplay policy), attempting unlock:', playErr);
                // Retrying on next window user interaction
                const unlock = () => {
                  user.audioTrack?.play();
                  window.removeEventListener('click', unlock);
                  window.removeEventListener('touchstart', unlock);
                };
                window.addEventListener('click', unlock);
                window.addEventListener('touchstart', unlock);
              }
            }
            setState('speaking');
            broadcastRTM('state', { state: 'speaking' });

            // Calculate turn response latency (TTFA)
            if (turnStartTimeRef.current > 0) {
              const latency = Date.now() - turnStartTimeRef.current;
              setMetrics(m => ({ ...m, latencyMs: latency }));
              telemetryService.recordTurnMetric({
                turnId: Date.now().toString(),
                userId: userId || undefined,
                channelName: CHANNEL_NAME,
                vadDurationMs: 600,
                turnLatencyMs: latency
              });
              turnStartTimeRef.current = 0;
            }
          }
        } catch (subErr) {
          console.error('[Agora RTC] Error subscribing to remote track:', subErr);
        }
      });

      rtcClient.current.on('user-unpublished', (user, mediaType) => {
        console.log(`[Agora RTC] Remote user unpublished: UID=${user.uid}, mediaType=${mediaType}`);
        if (mediaType === 'audio') {
          user.audioTrack?.stop();
          setState('listening');
          broadcastRTM('state', { state: 'listening' });
          turnStartTimeRef.current = Date.now();
        }
      });

      // Listen to Agent stream messages (transcript events)
      rtcClient.current.on('stream-message', (_uid, data) => {
        try {
          const textMsg = new TextDecoder().decode(data);
          const parsed = JSON.parse(textMsg);
          if (parsed.text) {
             const newMsg: TranscriptMessage = {
               id: Date.now().toString(),
               role: parsed.role || 'agent',
               text: parsed.text,
               timestamp: new Date()
             };
             setTranscript(prev => [...prev, newMsg]);
             broadcastRTM('transcript', { message: newMsg });
             agentService.submitTurnTranscript(CHANNEL_NAME, parsed.text, parsed.role || 'agent');
          }
        } catch (e) {}
      });

      // Initialize or reuse the RTM singleton client without tearing down connections
      await agoraRtm.initOrGet('publisher');

      // Setup RTC Audio Track & Join Channel
      const rtcUid = 100000 + Math.floor(Math.random() * 90000) + 1;
      const tokenData = await agentService.getTokens(CHANNEL_NAME, rtcUid, 'publisher');
      const effectiveAppId = APP_ID || (tokenData as any).appId || 'd6289000c1bc4e0d9247e44a3b33c138';

      await rtcClient.current.join(effectiveAppId, CHANNEL_NAME, tokenData.rtcToken, rtcUid);
      
      // Initialize microphone track with Acoustic Echo Cancellation, Noise Suppression, and AGC
      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack({
        ANS: true,
        AEC: true,
        AGC: true
      });
      await rtcClient.current.publish([localAudioTrack.current]);
      
      setMetrics(m => ({ ...m, connected: true }));

      const resolvedVoiceprint = voiceprintUrl || (userId ? localStorage.getItem(`mumai_voiceprint_${userId}`) : null);

      await agentService.startAgent(CHANNEL_NAME, {
        voiceprintUrl: resolvedVoiceprint || undefined
      });
      
      setState('listening');
      turnStartTimeRef.current = Date.now();
      await broadcastRTM('state', { state: 'listening' });
    } catch (error) {
      console.error("Error starting call:", error);
      await cleanupMedia();
      setState('error');
    }
  };

  const stopCall = async () => {
    try {
      await cleanupMedia();
      
      if (isDependent) {
        await agentService.stopAgent(CHANNEL_NAME);
        await telemetryService.flushSessionSummary(userId || 'dependent', CHANNEL_NAME);
      }

      setMetrics(m => ({ ...m, connected: false }));
      setState('idle');
      if (isDependent) broadcastRTM('state', { state: 'idle' });
    } catch (error) {
      console.error("Error stopping call:", error);
    }
  };

  const toggleListening = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      startCall();
    } else {
      stopCall();
    }
  }, [state, isDependent]);

  const triggerSOS = useCallback(() => {
    if (userId) {
      logMemory(userId, 'Emergency SOS triggered by user.', 'alert');
    }
    broadcastRTM('metrics', { metrics: { jitterPct: 1.5, latencyMs: 250 } });
  }, [userId]);

  return {
    state,
    volume,
    metrics,
    transcript,
    memories,
    toggleListening,
    triggerSOS
  };
}
