import { useState, useCallback, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import AgoraRTM from 'agora-rtm-sdk';
import { AgentState, TelemetryMetrics, MemoryRecord, TranscriptMessage } from '../types';
import { UserRole, logMemory, subscribeToMemories } from '../lib/db';
import { auth } from '../lib/firebase';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';
const CHANNEL_NAME = 'mummy-dev';

export function useMumAI(userRole: UserRole = 'dependent', userId: string | null = null) {
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
  
  const rtmClient = useRef<any>(null);
  const rtmChannel = useRef<any>(null);
  const isDependent = userRole === 'dependent';

  useEffect(() => {
    let unsubscribeMemories: (() => void) | undefined;
    
    // Subscribe to Firestore memories
    if (userId || userRole === 'caregiver') {
      const targetId = isDependent ? userId : null;
      unsubscribeMemories = subscribeToMemories(targetId, (newMemories) => {
        setMemories(newMemories);
      });
    }

    // If caregiver, we auto-connect to RTM to monitor
    if (userRole === 'caregiver') {
      startRTMOnly();
    }
    return () => {
      stopCall();
      if (unsubscribeMemories) unsubscribeMemories();
    };
  }, [userRole, userId]);

  const getAgoraToken = async (uid: number, role: string) => {
    const res = await fetch('/api/agora/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName: CHANNEL_NAME, uid, role })
    });
    if (!res.ok) throw new Error('Failed to fetch token');
    const data = await res.json();
    return { rtcToken: data.rtcToken, rtmToken: data.rtmToken, uid: data.uid };
  };

  const startAgent = async () => {
    const res = await fetch('/api/agora/start-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName: CHANNEL_NAME })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || err.error || 'Failed to start agent');
    }
  };

  const stopAgent = async () => {
    try {
      await fetch('/api/agora/stop-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: CHANNEL_NAME })
      });
    } catch (e) {
      console.error(e);
    }
  };

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

  const cleanupRTM = async () => {
    if (rtmClient.current) {
      try {
        await rtmClient.current.unsubscribe(CHANNEL_NAME);
      } catch (e) {}
      try {
        await rtmClient.current.logout();
      } catch (e) {}
      rtmClient.current = null;
    }
  };

  const startRTMOnly = async () => {
    if (!APP_ID) return;
    try {
      await cleanupRTM();
      const uid = Math.floor(Math.random() * 10000) + 1;
      const { rtmToken, uid: rtmUid } = await getAgoraToken(uid, 'subscriber');

      const client = new AgoraRTM.RTM(APP_ID, rtmUid);
      rtmClient.current = client;
      await client.login({ token: rtmToken });
      await client.subscribe(CHANNEL_NAME);
      
      client.addEventListener('message', (event: any) => {
        if (event.channelName === CHANNEL_NAME && event.messageType === 'STRING') {
          try {
            const data = JSON.parse(event.message);
            if (data.type === 'transcript') {
              setTranscript(prev => [...prev, data.message]);
            } else if (data.type === 'state') {
              setState(data.state);
            } else if (data.type === 'metrics') {
              setMetrics(prev => ({ ...prev, ...data.metrics }));
            }
          } catch (e) {}
        }
      });
      setMetrics(m => ({ ...m, connected: true }));
    } catch (e) {
      console.error("RTM Error", e);
    }
  };

  const broadcastRTM = async (type: string, payload: any) => {
    if (!rtmClient.current) return;
    try {
      const msg = JSON.stringify({ type, ...payload });
      await rtmClient.current.publish(CHANNEL_NAME, msg);
    } catch (e) {
      console.error("Broadcast error", e);
    }
  };

  const startCall = async () => {
    if (!APP_ID) {
      console.error("VITE_AGORA_APP_ID is not set in environment variables");
      return;
    }

    try {
      await cleanupMedia();
      await cleanupRTM();

      setState('thinking');
      
      rtcClient.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // Enable volume indicator to drive the fluid orb
      rtcClient.current.enableAudioVolumeIndicator();
      rtcClient.current.on("volume-indicator", (volumes) => {
        let maxVol = 0;
        volumes.forEach((v) => {
          if (v.level > maxVol) maxVol = v.level;
        });
        setVolume(maxVol);
      });

      rtcClient.current.on('user-published', async (user, mediaType) => {
        await rtcClient.current?.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          setState('speaking');
          broadcastRTM('state', { state: 'speaking' });
        }
      });

      rtcClient.current.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'audio') {
          user.audioTrack?.stop();
          setState('listening');
          broadcastRTM('state', { state: 'listening' });
        }
      });

      // Listen to Agent stream messages (transcript events)
      rtcClient.current.on('stream-message', (uid, data) => {
        try {
          const textMsg = new TextDecoder().decode(data);
          const parsed = JSON.parse(textMsg);
          // If agent sends text:
          if (parsed.text) {
             const newMsg: TranscriptMessage = {
               id: Date.now().toString(),
               role: parsed.role || 'agent',
               text: parsed.text,
               timestamp: new Date()
             };
             setTranscript(prev => [...prev, newMsg]);
             broadcastRTM('transcript', { message: newMsg });
          }
        } catch (e) {}
      });

      const uid = Math.floor(Math.random() * 10000) + 1;
      const { rtcToken, rtmToken, uid: stringUid } = await getAgoraToken(uid, 'publisher');
      
      // Initialize RTM
      const client = new AgoraRTM.RTM(APP_ID, stringUid);
      rtmClient.current = client;
      await client.login({ token: rtmToken });
      await client.subscribe(CHANNEL_NAME);

      await rtcClient.current.join(APP_ID, CHANNEL_NAME, rtcToken, uid);
      
      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
      await rtcClient.current.publish([localAudioTrack.current]);
      
      setMetrics(m => ({ ...m, connected: true }));

      await startAgent();
      
      setState('listening');
      await broadcastRTM('state', { state: 'listening' });
    } catch (error) {
      console.error("Error starting call:", error);
      await cleanupMedia();
      await cleanupRTM();
      setState('error');
    }
  };

  const stopCall = async () => {
    try {
      await cleanupMedia();
      await cleanupRTM();
      
      if (isDependent) {
        await stopAgent();
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
