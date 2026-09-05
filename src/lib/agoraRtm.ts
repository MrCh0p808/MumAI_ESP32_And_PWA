import AgoraRTM from 'agora-rtm-sdk';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';
export const CHANNEL_NAME = 'mummy-dev';

type RTMMessageCallback = (type: string, data: any) => void;

class AgoraRtmService {
  private client: any = null;
  private currentUid: string | null = null;
  private currentRole: 'publisher' | 'subscriber' | null = null;
  private listeners: Set<RTMMessageCallback> = new Set();
  private connectPromise: Promise<any> | null = null;
  private isConnected: boolean = false;
  private failedAttempts: number = 0;
  private lastFailTime: number = 0;

  public addMessageListener(cb: RTMMessageCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notifyListeners(type: string, data: any) {
    this.listeners.forEach(cb => {
      try {
        cb(type, data);
      } catch (err) {
        console.error('Error in RTM message listener:', err);
      }
    });
  }

  /**
   * Returns a stable UID per browser session to prevent generating new random UIDs on every render
   */
  private getStableUid(role: 'publisher' | 'subscriber'): string {
    const storageKey = `mumai_rtm_uid_${role}`;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) return stored;
      const rolePrefix = role === 'publisher' ? '10' : '20';
      const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
      const newUid = rolePrefix + randomSuffix;
      sessionStorage.setItem(storageKey, newUid);
      return newUid;
    } catch {
      return role === 'publisher' ? '10999' : '20999';
    }
  }

  /**
   * Connect or reuse the existing RTM connection.
   * If already logged in and subscribed, avoids instantiating new RTM clients (which causes mutual kicks).
   */
  public async initOrGet(role: 'publisher' | 'subscriber'): Promise<any> {
    if (!APP_ID) {
      console.warn("VITE_AGORA_APP_ID not configured.");
      return null;
    }

    // Rate-limit retries if failed recently (cooldown 10s)
    if (this.failedAttempts >= 3 && Date.now() - this.lastFailTime < 10000) {
      console.warn("[RTM] In cooldown period following connection errors. Skipping reconnect.");
      return null;
    }

    // If already connected with an active client and same role, reuse
    if (this.client && this.isConnected && this.currentRole === role) {
      return this.client;
    }

    // Deduplicate in-flight connection promises
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      try {
        // If there's an existing client that is stale or role changed, clean it up first
        if (this.client) {
          await this.disconnect();
        }

        const stringUid = this.getStableUid(role);
        const uidNum = parseInt(stringUid, 10);

        // Fetch RTM token from backend
        const res = await fetch('/api/agora/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelName: CHANNEL_NAME, uid: uidNum, role })
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch Agora token: ${res.statusText}`);
        }

        const tokenData = await res.json();
        const effectiveUid = tokenData.uid || stringUid;
        const rtmToken = tokenData.rtmToken;

        const targetAppId = tokenData.appId || APP_ID;
        if (!targetAppId) {
          throw new Error("Agora App ID is not configured");
        }

        // Initialize Agora RTM client
        const client = new AgoraRTM.RTM(targetAppId, effectiveUid, {
          logUpload: false
        });
        
        this.client = client;
        this.currentUid = effectiveUid;
        this.currentRole = role;

        // Setup message listener
        client.addEventListener('message', (event: any) => {
          if (event.channelName === CHANNEL_NAME && (event.messageType === 'STRING' || event.messageType === 1)) {
            try {
              const raw = typeof event.message === 'string' ? event.message : new TextDecoder().decode(event.message);
              const parsed = JSON.parse(raw);
              const msgType = parsed.type || parsed.event_type || (parsed.text ? 'transcript' : (parsed.state ? 'state' : 'unknown'));
              this.notifyListeners(msgType, parsed);
            } catch (e) {
              console.warn("Failed to parse RTM message:", event.message);
            }
          }
        });

        client.addEventListener('linkState', (event: any) => {
          console.log(`[RTM LinkState] ${event.currentState} (reason: ${event.reason || 'none'})`);
          if (event.currentState === 'CONNECTED') {
            this.isConnected = true;
            this.failedAttempts = 0;
          } else if (event.currentState === 'FAILED' || event.currentState === 'DISCONNECTED') {
            this.isConnected = false;
          }
        });

        await client.login({ token: rtmToken });
        await client.subscribe(CHANNEL_NAME);

        this.isConnected = true;
        this.failedAttempts = 0;
        return this.client;
      } catch (error) {
        console.warn("Agora RTM init warning (will fallback gracefully to RTC):", error);
        this.failedAttempts++;
        this.lastFailTime = Date.now();
        this.isConnected = false;
        if (this.client) {
          try {
            await this.client.logout();
          } catch {}
          this.client = null;
        }
        return null;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  public async publish(type: string, payload: any): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    try {
      const msg = JSON.stringify({ type, ...payload });
      await this.client.publish(CHANNEL_NAME, msg);
    } catch (err) {
      console.warn("Agora RTM publish warning:", err);
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.client) return;
    const clientToClean = this.client;
    this.client = null;
    this.isConnected = false;
    this.currentUid = null;
    this.currentRole = null;
    this.connectPromise = null;

    try {
      await clientToClean.unsubscribe(CHANNEL_NAME);
    } catch (e) {}

    try {
      await clientToClean.logout();
    } catch (e) {}
  }
}

export const agoraRtm = new AgoraRtmService();

