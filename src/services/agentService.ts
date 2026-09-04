export interface StartAgentOptions {
  promptOverride?: string;
  voiceprintId?: string;
  voiceprintUrl?: string;
  language?: string;
  enableVoiceprint?: boolean;
  ttsEngine?: 'sarvam' | 'elevenlabs';
}

export interface AgoraTokenResponse {
  rtcToken: string;
  rtmToken: string;
  uid: number;
  appId?: string;
}

export interface StartAgentResponse {
  agent_id?: string;
  agentId?: string;
  status?: string;
  alreadyRunning?: boolean;
}

class AgentService {
  /**
   * Mints temporary 1-hour RTC & RTM tokens from the backend.
   */
  async getTokens(channelName: string, uid: number, role: 'publisher' | 'subscriber' = 'publisher'): Promise<AgoraTokenResponse> {
    const res = await fetch('/api/agora/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName, uid, role })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to mint Agora credentials');
    }
    return res.json();
  }

  /**
   * Uploads 16kHz mono PCM voiceprint data to the backend.
   */
  async uploadVoiceprint(userId: string, audioBase64: string): Promise<{ success: boolean; voiceprintUrl: string }> {
    const res = await fetch('/api/voiceprint/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, audioBase64 })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload voiceprint');
    }
    return res.json();
  }

  /**
   * Checks whether a user has an enrolled voiceprint on disk.
   */
  async checkVoiceprint(userId: string): Promise<{ hasVoiceprint: boolean; voiceprintUrl: string | null }> {
    try {
      const res = await fetch(`/api/voiceprint/status/${encodeURIComponent(userId)}`);
      if (res.ok) {
        return res.json();
      }
    } catch (e) {
      console.warn('Could not query voiceprint status:', e);
    }
    return { hasVoiceprint: false, voiceprintUrl: null };
  }

  /**
   * Initiates the Agora Conversational AI Agent with Sarvam/ElevenLabs TTS, interruption, and voiceprint.
   */
  async startAgent(channelName: string, options?: StartAgentOptions): Promise<StartAgentResponse> {
    const res = await fetch('/api/agora/start-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelName,
        promptOverride: options?.promptOverride,
        voiceprintUrl: options?.voiceprintUrl,
        ttsEngine: options?.ttsEngine,
        language: options?.language || 'multi'
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || err.error || 'Failed to start Conversational AI Agent');
    }
    return res.json();
  }

  /**
   * Gracefully stops the active Conversational AI Agent.
   */
  async stopAgent(channelName: string): Promise<void> {
    try {
      const res = await fetch('/api/agora/stop-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName })
      });
      if (!res.ok) {
        console.warn('Stop agent returned status', res.status);
      }
    } catch (e) {
      console.warn('Error terminating agent session:', e);
    }
  }

  /**
   * Forwards conversational transcript turns or processed text to backend processing/logging.
   */
  async submitTurnTranscript(channelName: string, text: string, role: 'user' | 'agent' = 'user'): Promise<void> {
    try {
      await fetch('/api/agent/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, text, role, timestamp: Date.now() })
      });
    } catch (e) {
      // Non-critical network fire-and-forget
      console.warn('Turn submission note:', e);
    }
  }
}

export const agentService = new AgentService();
