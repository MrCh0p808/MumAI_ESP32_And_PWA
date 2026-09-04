#ifndef MAA_CONFIG_EXAMPLE_H
#define MAA_CONFIG_EXAMPLE_H

// ======================================================================================
// 👵 Maa (MumAI Companion) - Hardware Configuration Template
// ======================================================================================
// Copy this file to "config.h" and insert your real private credentials.
// NOTE: "config.h" is git-ignored and will NEVER be committed to version control.
// ======================================================================================

// WiFi Credentials
#define WIFI_SSID             "YOUR_WIFI_SSID"
#define WIFI_PASSWORD         "YOUR_WIFI_PASSWORD"

// Mum AI Cloud Gateway Endpoint
// For Cloud deployment on Render:
//   GATEWAY_HOST: "mum-ai.onrender.com"
//   GATEWAY_PORT: 443  (WSS / SSL enabled)
// For local testing on your home Wi-Fi:
//   GATEWAY_HOST: "192.168.1.50" (your development machine IP)
//   GATEWAY_PORT: 3000 (WS / SSL disabled)
#define GATEWAY_HOST          "mum-ai.onrender.com"
#define GATEWAY_PORT          443
#define GATEWAY_PATH          "/api/audio/stream"
#define GATEWAY_USE_SSL       true

// Device Identity in Agora/Mum AI Session
#define DEVICE_ID             "esp32_maa"
#define AGORA_CHANNEL_NAME    "mummy-dev"

// Audio Tuning Constants
#define AUDIO_SAMPLE_RATE     16000     // 16 kHz
#define FRAME_SAMPLES         256       // 16ms frames
#define MIC_BIT_SHIFT         14        // +12dB analog gain boost from 24-bit MSB
#define MIC_DC_FILTER_ALPHA   0.05f     // Single-pole high-pass DC bias remover
#define MIC_SOFT_CLIP_THRESH  32000     // Prevent 16-bit clipping

#endif // MAA_CONFIG_EXAMPLE_H
