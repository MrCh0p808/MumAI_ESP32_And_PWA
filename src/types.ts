export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
    
export interface TelemetryMetrics {
  jitterPct: number;
  shimmerDb: number;
  latencyMs: number;
  connected: boolean;
  batteryPct?: number;
}

export interface MemoryRecord {
  id: string;
  timestamp: Date;
  category: 'medical' | 'routine' | 'alert' | 'preference';
  content: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}
