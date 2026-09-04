import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase-config';

export interface TurnMetricEvent {
  turnId: string;
  userId?: string;
  channelName: string;
  vadDurationMs: number;
  turnLatencyMs: number; // Time to First Audio (TTFA)
  sttConfidence?: number;
  interruptionsCount?: number;
  timestamp: number;
}

export interface InteractionEvent {
  type: 'session_start' | 'session_end' | 'barge_in' | 'error' | 'voiceprint_match' | 'voiceprint_rejected';
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface SessionHealthSummary {
  id?: string;
  userId: string;
  channelName: string;
  turnsCount: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  bargeInCount: number;
  voiceprintMatchPct: number;
  startedAt: number;
  endedAt: number;
}

class TelemetryService {
  private turnBuffer: TurnMetricEvent[] = [];
  private eventBuffer: InteractionEvent[] = [];
  private sessionStartTime: number = Date.now();
  private bargeInCount: number = 0;
  private voiceprintMatches: number = 0;
  private voiceprintTotal: number = 0;

  public startSession(channelName: string, userId?: string) {
    this.turnBuffer = [];
    this.eventBuffer = [];
    this.sessionStartTime = Date.now();
    this.bargeInCount = 0;
    this.voiceprintMatches = 0;
    this.voiceprintTotal = 0;

    this.logEvent({
      type: 'session_start',
      metadata: { channelName, userId }
    });
  }

  public recordTurnMetric(metric: Omit<TurnMetricEvent, 'timestamp'>) {
    const fullMetric: TurnMetricEvent = {
      ...metric,
      timestamp: Date.now()
    };
    this.turnBuffer.push(fullMetric);
  }

  public logEvent(event: Omit<InteractionEvent, 'timestamp'>) {
    const fullEvent: InteractionEvent = {
      ...event,
      timestamp: Date.now()
    };
    this.eventBuffer.push(fullEvent);
    if (event.type === 'barge_in') {
      this.bargeInCount++;
    }
    if (event.type === 'voiceprint_match') {
      this.voiceprintMatches++;
      this.voiceprintTotal++;
    } else if (event.type === 'voiceprint_rejected') {
      this.voiceprintTotal++;
    }
  }

  /**
   * Flushes consolidated turn and latency health metrics to Firestore in a single write,
   * avoiding Firestore quota burn and unbounded network calls.
   */
  public async flushSessionSummary(userId: string, channelName: string): Promise<void> {
    if (this.turnBuffer.length === 0 && this.eventBuffer.length <= 1) {
      return;
    }

    const turnsCount = this.turnBuffer.length;
    const totalLatency = this.turnBuffer.reduce((sum, t) => sum + (t.turnLatencyMs || 0), 0);
    const avgLatency = turnsCount > 0 ? Math.round(totalLatency / turnsCount) : 0;
    const maxLatency = this.turnBuffer.reduce((max, t) => Math.max(max, t.turnLatencyMs || 0), 0);
    const voiceprintPct = this.voiceprintTotal > 0 ? Math.round((this.voiceprintMatches / this.voiceprintTotal) * 100) : 100;

    const summaryPayload: SessionHealthSummary = {
      userId,
      channelName,
      turnsCount,
      avgLatencyMs: avgLatency,
      maxLatencyMs: maxLatency,
      bargeInCount: this.bargeInCount,
      voiceprintMatchPct: voiceprintPct,
      startedAt: this.sessionStartTime,
      endedAt: Date.now()
    };

    try {
      if (!auth.currentUser) {
        console.warn('Skipping telemetry log: User not authenticated');
        return;
      }
      await addDoc(collection(db, 'telemetry'), {
        ...summaryPayload,
        createdAt: serverTimestamp()
      });
      // Clear buffer after successful flush
      this.turnBuffer = [];
      this.eventBuffer = [];
    } catch (err) {
      console.error('Failed to log telemetry to Firestore:', err);
    }
  }

  /**
   * Realtime subscriber for caregiver charts and health summaries.
   */
  public subscribeToTelemetry(callback: (summaries: SessionHealthSummary[]) => void) {
    if (!auth.currentUser) {
      console.warn('Skipping telemetry subscription: User not authenticated');
      return () => {}; // return empty unsubscribe function
    }
    const telemetryRef = collection(db, 'telemetry');
    const q = query(telemetryRef, orderBy('createdAt', 'desc'), limit(14));

    return onSnapshot(q, (snapshot) => {
      const summaries: SessionHealthSummary[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || 'anonymous',
          channelName: data.channelName || 'default',
          turnsCount: data.turnsCount || 0,
          avgLatencyMs: data.avgLatencyMs || 0,
          maxLatencyMs: data.maxLatencyMs || 0,
          bargeInCount: data.bargeInCount || 0,
          voiceprintMatchPct: data.voiceprintMatchPct ?? 100,
          startedAt: data.startedAt || Date.now(),
          endedAt: data.endedAt || Date.now()
        };
      });
      callback(summaries);
    }, (err) => {
      console.warn('Telemetry subscription note:', err.message);
    });
  }
}

export const telemetryService = new TelemetryService();
