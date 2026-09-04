import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import pkg from 'agora-token';
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = pkg;
import 'dotenv/config';

// Module-level state to track the active agent ID
let activeAgentId: string | null = null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({
    verify: (req, res, buf) => {
      (req as any).rawBody = buf;
    }
  }));

  // API to generate Agora token (RTC + RTM)
  app.post('/api/agora/token', (req, res) => {
    try {
      const { channelName, uid, role } = req.body;
      const appId = process.env.AGORA_APP_ID;
      const appCertificate = process.env.AGORA_APP_CERTIFICATE;

      if (!appId || !appCertificate) {
        return res.status(500).json({ error: 'Agora credentials missing' });
      }

      if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
      }

      const expireTimeInSeconds = 3600; // 1 hour token

      const uidStr = uid ? uid.toString() : '0';
      const uidInt = parseInt(uidStr, 10);
      const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

      // Generate RTC Token
      const rtcToken = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uidInt,
        rtcRole,
        expireTimeInSeconds,
        expireTimeInSeconds
      );

      // Generate RTM Token
      const rtmToken = RtmTokenBuilder.buildToken(
        appId,
        appCertificate,
        uidStr,
        expireTimeInSeconds
      );

      res.json({ rtcToken, rtmToken, privilegeExpiredTs: expireTimeInSeconds, uid: uidStr });
    } catch (error) {
      console.error('Error generating token:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  // Mock MCP (Model Context Protocol) Endpoint for Agent memory ingestion
  app.post('/api/mcp/log_memory', (req, res) => {
    // In production, the Agent calls this with the extracted episodic data.
    // It would be validated and written to Firestore via Admin SDK.
    const { dependentId, content, category } = req.body;
    console.log(`[MCP INGEST] Memory logged for ${dependentId}: [${category}] ${content}`);
    res.json({ status: 'ok', ingested: true });
  });

  // API to start the Conversational AI agent
  app.post('/api/agora/start-agent', async (req, res) => {
    try {
      const { channelName, patientName } = req.body;
      const appId = process.env.AGORA_APP_ID;
      const appCertificate = process.env.AGORA_APP_CERTIFICATE;
      const customerId = process.env.AGORA_CUSTOMER_ID;
      const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

      if (!appId || !appCertificate || !customerId || !customerSecret) {
        return res.status(500).json({ error: 'Agora REST credentials missing' });
      }

      if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
      }
      
      const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
      
      const agentUid = 1000;
      const expirationTimeInSeconds = 3600;
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
      // We generate an RTC token for the agent to join the channel
      const token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, agentUid, RtcRole.PUBLISHER, privilegeExpiredTs);
      
      const dynamicName = patientName || "Beta";
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? "Subh prabhat" : hour < 18 ? "Dopahar ka namaste" : "Shubh sandhya";
      const dynamicGreeting = `Hello ${dynamicName}, ${timeOfDay}! Kaise ho aap?`;
      const dynamicPrompt = `You are the TTox.Tech Elite 'Maa' companion. You are an empathetic, protective Indian mother persona providing proactive care. Keep your answers concise, warm, and natural. Speak in conversational Hinglish/Hindi. The user's name is ${dynamicName}. IMPORTANT: Use natural Indian conversational filler words like 'Hmm..', 'Acha..', 'Sahi..', 'Ji..' gracefully to keep the conversation flowing.`;

      const payload = {
        name: channelName,
        pipeline_id: "824590f6b8164d0da7d3da8319ad7ccd",
        properties: {
          channel: channelName,
          token: token,
          agent_rtc_uid: agentUid.toString(),
          remote_rtc_uids: ["*"],
          idle_timeout: 300,
          advanced_features: {
              enable_aivad: true
          },
          turn_detection: {
              mode: "server_vad",
              server_vad_config: {
                  threshold: 0.5,
                  prefix_padding_ms: 800,
                  silence_duration_ms: 640
              }
          },
          asr: {
              vendor: "deepgram",
              params: {
                  resource_id: "2ca6dcf4ded340b6b67f0ccf4972a00d",
                  model: "nova-3",
                  keyterm: "",
                  language: "en"
              }
          },
          llm: {
              vendor: "gemini",
              url: "https://generativelanguage.googleapis.com/v1beta",
              model: "gemini-2.5-pro",
              resource_id: "b48a37a7-f8a6-4d9c-88ff-a8a0fd0270b0",
              failure_message: "Beta, ek second dena.",
              greeting_message: dynamicGreeting,
              system_messages: [
                  {
                      role: "system",
                      content: dynamicPrompt
                  }
              ],
              temperature: 0.4,
              params: {
                  model: "gemini-2.5-pro",
                  temperature: 0.4
              }
          },
          tts: {
              vendor: "elevenlabs",
              model: "eleven_flash_v2_5",
              params: {
                  model_id: "eleven_flash_v2_5",
                  sample_rate: 24000,
                  similarity_boost: 0.75,
                  speaker_boost: true,
                  speed: 1,
                  stability: 0.5,
                  style: 0,
                  voice_id: "pNInz6obpgDQGcFmaJgB",
                  resource_id: "4fd89f26-95c6-4266-93e8-c14c5879485c"
              }
          }
        }
      };

      const response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Agora Agent Join Error:', data);
        return res.status(response.status).json(data);
      }

      // Store agentId so we can stop it later
      if (data.agentId) {
        activeAgentId = data.agentId;
      }

      res.json(data);
    } catch (error) {
      console.error('Error starting agent:', error);
      res.status(500).json({ error: 'Failed to start agent' });
    }
  });

  // API to stop the Conversational AI agent
  app.post('/api/agora/stop-agent', async (req, res) => {
    try {
      const { channelName } = req.body;
      const appId = process.env.AGORA_APP_ID;
      const customerId = process.env.AGORA_CUSTOMER_ID;
      const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

      if (!appId || !customerId || !customerSecret) {
        return res.status(500).json({ error: 'Agora REST credentials missing' });
      }

      if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
      }
      
      const agentId = activeAgentId;
      if (!agentId) {
         console.log("No active agent ID found to stop");
         return res.json({ success: true });
      }

      const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
      
      // To stop, we call POST /v2/projects/{appid}/agents/{agentId}/leave
      const response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        }
      });

      const data = await response.text();
      
      if (!response.ok) {
        console.error('Agora Agent Leave Error:', data);
        return res.status(response.status).json({ error: data });
      }

      activeAgentId = null;
      res.json({ success: true });
    } catch (error) {
      console.error('Error stopping agent:', error);
      res.status(500).json({ error: 'Failed to stop agent' });
    }
  });

  // API to handle Tool Calling Webhooks from Agora Conversational AI
  app.post('/api/agora/webhook', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const agoraSignature = req.headers['agora-signature'] || req.headers['Agora-Signature'];
      const expectedSecret = process.env.AGORA_WEBHOOK_SECRET;

      let isAuthorized = false;

      // Security Sentinel: Dual-Mode Authorization
      if (!expectedSecret) {
        // If no secret is configured, allow for local testing, but warn.
        console.warn('[Security] No AGORA_WEBHOOK_SECRET set! Webhook is unauthenticated.');
        isAuthorized = true;
      } else {
        // 1. Check Bearer Token (for Custom Tool UI calls)
        if (authHeader === `Bearer ${expectedSecret}`) {
          isAuthorized = true;
        } 
        // 2. Check Agora Signature (for Global Webhook UI events)
        else if (agoraSignature) {
          const rawBody = (req as any).rawBody;
          if (rawBody) {
            // Agora uses HMAC SHA1 or SHA256 with the signing secret
            const hmac = crypto.createHmac('sha1', expectedSecret).update(rawBody).digest('hex');
            const hmac256 = crypto.createHmac('sha256', expectedSecret).update(rawBody).digest('hex');
            
            if (hmac === agoraSignature || hmac256 === agoraSignature) {
              isAuthorized = true;
            }
          }
        }
      }

      if (!isAuthorized) {
        console.warn('[Security] Unauthorized webhook attempt. Check your AGORA_WEBHOOK_SECRET.');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log('[Webhook] Received event from Agora:', req.body);
      
      const { tool_name, arguments: toolArgs } = req.body;

      // Telemetry Engine Route
      if (tool_name === 'log_health_metric') {
        console.log(`[Tool Execution] Logging metric:`, toolArgs);
        // TODO: Phase 3 - Write this directly to Firebase Firestore
        
        // We must respond with a result so the LLM knows it succeeded
        return res.status(200).json({ 
          success: true, 
          message: `Successfully logged ${toolArgs?.metric_type} reading of ${toolArgs?.value}.` 
        });
      }

      // Default success for ping/unhandled events
      return res.status(200).json({ success: true, message: 'Event received' });
    } catch (error) {
      console.error('[Webhook] Error processing event:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
