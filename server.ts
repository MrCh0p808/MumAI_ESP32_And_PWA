import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import pkg from 'agora-token';
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = pkg;
import 'dotenv/config';

// Module-level state to track the active agent ID
let activeAgentId: string | null = null;

async function startServer() {
  const app = express();
  // Use Render's dynamically assigned PORT in production, fallback to 3000 for local dev
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Ensure public voiceprints directory exists
  const voiceprintsDir = path.join(process.cwd(), 'public', 'voiceprints');
  if (!fs.existsSync(voiceprintsDir)) {
    fs.mkdirSync(voiceprintsDir, { recursive: true });
  }

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Serve voiceprint PCM audio files statically
  app.use('/voiceprints', express.static(voiceprintsDir, {
    setHeaders: (res) => {
      res.setHeader('Content-Type', 'audio/l16; rate=16000; channels=1');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }));

  // ==========================================
  // 1. Voiceprint Enrollment Endpoints
  // ==========================================

  // Upload and store user voiceprint PCM file
  app.post('/api/voiceprint/upload', (req, res) => {
    try {
      const { userId, audioBase64 } = req.body;
      if (!userId || !audioBase64) {
        return res.status(400).json({ error: 'userId and audioBase64 are required' });
      }

      const sanitizedId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(voiceprintsDir, `${sanitizedId}.pcm`);
      const buffer = Buffer.from(audioBase64, 'base64');

      fs.writeFileSync(filePath, buffer);
      console.log(`[Voiceprint] Stored calibration voiceprint for user ${sanitizedId} (${buffer.length} bytes)`);

      // Resolve public URL for Agora SAL
      const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
      const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      const voiceprintUrl = `${proto}://${host}/voiceprints/${sanitizedId}.pcm`;

      return res.json({
        success: true,
        voiceprintUrl,
        sizeBytes: buffer.length
      });
    } catch (err: any) {
      console.error('[Voiceprint] Upload error:', err);
      return res.status(500).json({ error: 'Failed to save voiceprint' });
    }
  });

  // Check voiceprint enrollment status
  app.get('/api/voiceprint/status/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const sanitizedId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(voiceprintsDir, `${sanitizedId}.pcm`);

      if (fs.existsSync(filePath)) {
        const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
        const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const voiceprintUrl = `${proto}://${host}/voiceprints/${sanitizedId}.pcm`;
        return res.json({ hasVoiceprint: true, voiceprintUrl });
      }
      return res.json({ hasVoiceprint: false, voiceprintUrl: null });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to inspect voiceprint' });
    }
  });

  // ==========================================
  // 2. Agora RTC & RTM Token Minting
  // ==========================================
  app.post('/api/agora/token', (req, res) => {
    try {
      const { channelName, uid, role } = req.body;
      const appId = process.env.AGORA_APP_ID || 'd6289000c1bc4e0d9247e44a3b33c138';
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

      const rtcToken = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uidInt,
        rtcRole,
        expireTimeInSeconds,
        expireTimeInSeconds
      );

      const rtmToken = RtmTokenBuilder.buildToken(
        appId,
        appCertificate,
        uidStr,
        expireTimeInSeconds
      );

      res.json({ rtcToken, rtmToken, privilegeExpiredTs: expireTimeInSeconds, uid: uidStr, appId });
    } catch (error) {
      console.error('Error generating token:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  // ==========================================
  // 3. Conversational AI Agent Management
  // ==========================================
  app.post('/api/agora/start-agent', async (req, res) => {
    try {
      const { channelName, patientName, pipelineId, asrResourceId, llmResourceId, ttsResourceId, voiceprintUrl, ttsEngine } = req.body;
      const appId = process.env.AGORA_APP_ID || 'd6289000c1bc4e0d9247e44a3b33c138';
      const appCertificate = process.env.AGORA_APP_CERTIFICATE;
      const customerId = process.env.AGORA_CUSTOMER_ID;
      const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

      if (!appId || !appCertificate || !customerId || !customerSecret) {
        return res.status(500).json({ error: 'Agora REST credentials missing' });
      }

      if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
      }

      const agentUid = 1001;
      const expireTimeInSeconds = 3600;
      const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        agentUid,
        RtcRole.PUBLISHER,
        expireTimeInSeconds,
        expireTimeInSeconds
      );

      const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

      const targetPipelineId = pipelineId || process.env.AGORA_PIPELINE_ID || 'b4cf52826990410f90c86ba864e604e7';
      const targetAsrResourceId = asrResourceId || process.env.AGORA_ASR_RESOURCE_ID || '67cf85d8-764e-42a1-b43e-36780806c744';
      const targetLlmResourceId = llmResourceId || process.env.AGORA_LLM_RESOURCE_ID || 'b48a37a7-336c-48ae-94a2-ca3992b45e99';
      const targetTtsResourceId = ttsResourceId || process.env.AGORA_TTS_RESOURCE_ID || '4fd89f26-0e42-45e0-b6c8-f94d9354924a';

      // TTS Configuration: Sarvam Bulbul V3 ('roopa' / Hindi) vs Console ElevenLabs
      const sarvamKey = process.env.SARVAM_API_KEY;
      const useSarvam = (ttsEngine === 'sarvam' || (!ttsEngine && sarvamKey));
      
      const ttsConfig: any = (useSarvam && sarvamKey) ? {
        vendor: "sarvam",
        model: "bulbul:v3",
        params: {
          api_key: sarvamKey,
          model: "bulbul:v3",
          speaker: "roopa",
          target_language_code: "hi-IN",
          language_code: "hi-IN"
        }
      } : {
        vendor: "elevenlabs",
        model: "eleven_multilingual_v2",
        params: {
          speed: 1,
          style: 0,
          model_id: "eleven_multilingual_v2",
          voice_id: "pNInz6obpgDQGcFmaJgB",
          stability: 0.5,
          resource_id: targetTtsResourceId,
          sample_rate: 24000,
          speaker_boost: true,
          similarity_boost: 0.75
        }
      };

      const systemPromptContent = "You are 'Maa' companion. You are an empathetic, supportive, protective, witty, and homely Indian mother persona providing proactive care. Keep your answers concise, warm, and natural. Speak in conversational Hinglish and Hindi.";

      // SAL Voiceprint Configuration
      const targetVoiceprintUrl = voiceprintUrl || process.env.AGORA_VOICEPRINT_SAMPLE_URL;
      const salConfig: any = targetVoiceprintUrl ? {
        sal_mode: "recognition",
        sample_urls: {
          "primary_user": targetVoiceprintUrl
        }
      } : {
        sal_mode: "locking"
      };

      // Base properties aligned with Agora ConvoAI End-to-End Specification
      const properties: any = {
        channel: channelName,
        token: token,
        agent_rtc_uid: agentUid.toString(),
        remote_rtc_uids: ["*"],
        idle_timeout: 300,
        advanced_features: {
          enable_aivad: true,
          enable_rtm: true,
          enable_sal: true
        },
        parameters: {
          data_channel: "rtm",
          enable_metrics: true,
          enable_error_message: true
        },
        sal: salConfig,
        turn_detection: {
          mode: "server_vad",
          server_vad_config: {
            threshold: 0.5,
            prefix_padding_ms: 600,
            silence_duration_ms: 500
          }
        },
        interruption: {
          enable: true,
          timeout_ms: 150
        },
        asr: {
          vendor: "deepgram",
          language: "multi", // Deepgram Nova-3 multilingual code-switching (Hindi, English, Hinglish)
          params: {
            resource_id: targetAsrResourceId,
            model: "nova-3",
            language: "multi"
          },
          model: "nova-3"
        },
        llm: {
          vendor: "gemini",
          params: {
            model: "gemini-2.5-pro",
            temperature: 0.4
          },
          system_messages: [
            {
              role: "system",
              content: systemPromptContent
            }
          ],
          greeting_message: "Haan beta, bolo! Main sun rahi hoon.",
          failure_message: "Arre beta, ek baar phir se bolo na, theek se sunai nahi diya.",
          model: "gemini-2.5-pro",
          resource_id: targetLlmResourceId,
          temperature: 0.4
        },
        tts: ttsConfig,
        mllm: {
          enable: false
        }
      };

      const payload: any = {
        name: channelName,
        pipeline_id: targetPipelineId,
        properties
      };

      let response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      });

      let data = await response.json();
      
      if (!response.ok) {
        // Stale session resolution: evict zombie agent from channel slot
        if (data.reason === 'TaskConflict' && data.agent_id) {
          console.warn(`[Agora] Channel ${channelName} occupied by agent ${data.agent_id}. Evicting stale session...`);
          try {
            await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${data.agent_id}/leave`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
              }
            });
            // 1s delay to allow SDRTN channel slot to release
            await new Promise(r => setTimeout(r, 1000));
            
            response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
              },
              body: JSON.stringify(payload)
            });
            data = await response.json();
            if (response.ok) {
              console.log(`[Agora] Agent started successfully after evicting stale session! ID: ${data.agent_id}`);
              activeAgentId = data.agent_id;
              return res.json(data);
            }
          } catch (evictErr) {
            console.error('[Agora] Error during stale agent eviction retry:', evictErr);
          }
        }

        // Automatic ElevenLabs fallback if Sarvam returns an error
        if (payload.properties.tts?.vendor === 'sarvam') {
          console.warn('[Agora] Sarvam TTS vendor rejected, falling back to ElevenLabs Multilingual V2:', data.detail || data.reason);
          payload.properties.tts = {
            vendor: "elevenlabs",
            model: "eleven_multilingual_v2",
            params: {
              speed: 1,
              style: 0,
              model_id: "eleven_multilingual_v2",
              voice_id: "pNInz6obpgDQGcFmaJgB",
              stability: 0.5,
              resource_id: targetTtsResourceId,
              sample_rate: 24000,
              speaker_boost: true,
              similarity_boost: 0.75
            }
          };

          response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader
            },
            body: JSON.stringify(payload)
          });
          data = await response.json();
        }

        if (!response.ok) {
          console.error('Agora Agent Join Error:', data);
          return res.status(response.status).json(data);
        }
      }

      if (data.agent_id || data.agentId) {
        activeAgentId = data.agent_id || data.agentId;
      }

      res.json(data);
    } catch (error) {
      console.error('Error starting agent:', error);
      res.status(500).json({ error: 'Failed to start agent' });
    }
  });

  // Stop the Conversational AI agent
  app.post('/api/agora/stop-agent', async (req, res) => {
    try {
      const { channelName } = req.body;
      const appId = process.env.AGORA_APP_ID || 'd6289000c1bc4e0d9247e44a3b33c138';
      const customerId = process.env.AGORA_CUSTOMER_ID;
      const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

      if (!appId || !customerId || !customerSecret) {
        return res.status(500).json({ error: 'Agora REST credentials missing' });
      }

      const authHeader = 'Basic ' + Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
      let agentId = activeAgentId;

      if (!agentId) {
        try {
          const listRes = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents`, {
            headers: { 'Authorization': authHeader }
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            if (listData?.data?.list?.length > 0) {
              const runningAgent = listData.data.list.find((a: any) => a.status === 'RUNNING');
              if (runningAgent) {
                agentId = runningAgent.agent_id;
              }
            }
          }
        } catch (err) {
          console.warn('Could not query active agents:', err);
        }
      }

      if (!agentId) {
        return res.json({ success: true, message: 'No active agent to stop' });
      }

      const response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        }
      });

      const data = await response.text();
      activeAgentId = null;

      if (!response.ok) {
        return res.status(response.status).json({ error: data });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error stopping agent:', error);
      res.status(500).json({ error: 'Failed to stop agent' });
    }
  });

  // Conversational turn telemetry record
  app.post('/api/agent/turn', (req, res) => {
    try {
      const { channelName, text, role } = req.body;
      if (!channelName || !text) {
        return res.status(400).json({ error: 'channelName and text are required' });
      }
      console.log(`[Turn Telemetry] [${role || 'user'}] (${channelName}): ${text}`);
      return res.status(200).json({ status: 'ok', receivedAt: Date.now() });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to record turn' });
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
    console.log(`MumAI Server running cleanly on http://localhost:${PORT}`);
  });
}

startServer();
