import AgoraRTM from 'agora-rtm-sdk';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || 'd6289000c1bc4e0d9247e44a3b33c138';
export const CHANNEL_NAME = 'mummy-dev';

type RTMMessageCallback = (type: string, data: any) => void;

class AgoraRtmService {
  private client: any = null;
  private currentUid: string | null = null;
  private currentRole: 'publisher' | 'subscriber' | null = null;
  private listeners: Set<RTMMessageCallback> = new Set();
  private isConnecting: boolean = false;
  private isConnected: boolean = false;

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
   * Connect or reuse the existing RTM connection.
   * If already logged in and subscribed, avoids instantiating new RTM clients (which causes mutual kicks).
   */
  public async initOrGet(role: 'publisher' | 'subscriber'): Promise<any> {
    if (!APP_ID) {
      console.warn("VITE_AGORA_APP_ID not configured.");
      return null;
    }

    // If already connected with an active client, reuse
    if (this.client && this.isConnected) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait for ongoing connection
      let retries = 0;
      while (this.isConnecting && retries < 20) {
        await new Promise(res => setTimeout(res, 200));
        retries++;
      }
      if (this.client && this.isConnected) return this.client;
    }

    this.isConnecting = true;
    try {
      // If there's an existing client that is stale, clean it up first
      if (this.client) {
        await this.disconnect();
      }

      // Generate a distinct UID based on role and timestamp to ensure zero collision
      const rolePrefix = role === 'publisher' ? 100000 : 200000;
      const uidNum = rolePrefix + Math.floor(Math.random() * 90000) + 1000;

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
      const stringUid = tokenData.uid || uidNum.toString();
      const rtmToken = tokenData.rtmToken;

      const client = new AgoraRTM.RTM(APP_ID, stringUid);
      this.client = client;
      this.currentUid = stringUid;
      this.currentRole = role;

      // Setup message listener
      client.addEventListener('message', (event: any) => {
        if (event.channelName === CHANNEL_NAME && event.messageType === 'STRING') {
          try {
            const parsed = JSON.parse(event.message);
            const msgType = parsed.type || parsed.event_type || (parsed.text ? 'transcript' : (parsed.state ? 'state' : 'unknown'));
            this.notifyListeners(msgType, parsed);
          } catch (e) {
            console.warn("Failed to parse RTM string message:", event.message);
          }
        }
      });

      client.addEventListener('linkState', (event: any) => {
        console.log(`[RTM LINK STATE EVENT]`, event);
      });

      await client.login({ token: rtmToken });
      await client.subscribe(CHANNEL_NAME);

      this.isConnected = true;
      return this.client;
    } catch (error) {
      console.error("Agora RTM init failed:", error);
      this.client = null;
      this.isConnected = false;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  public async publish(type: string, payload: any): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.warn("RTM client not connected, skipping publish:", type);
      return;
    }
    try {
      const msg = JSON.stringify({ type, ...payload });
      await this.client.publish(CHANNEL_NAME, msg);
    } catch (err) {
      console.error("Agora RTM publish error:", err);
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.client) return;
    const clientToClean = this.client;
    this.client = null;
    this.isConnected = false;
    this.currentUid = null;
    this.currentRole = null;

    try {
      await clientToClean.unsubscribe(CHANNEL_NAME);
    } catch (e) {}

    try {
      await clientToClean.logout();
    } catch (e) {}
  }
}

export const agoraRtm = new AgoraRtmService();
