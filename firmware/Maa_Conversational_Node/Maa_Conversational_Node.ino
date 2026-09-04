/*
 * ======================================================================================
 * 👵 Maa (MumAI Companion) - Phase 5 (Step 3): Unified Cloud Conversational AI Node
 * ======================================================================================
 * Target Board: ESP32-S3-N16R8 (16MB Flash / 8MB Octal OPI PSRAM)
 * Framework: Arduino IDE (ESP32 by Espressif Systems v2.0.14+ or v3.0+)
 *
 * REQUIRED ARDUINO LIBRARIES (Install via Tools -> Manage Libraries):
 * 1. "Adafruit GFX Library" by Adafruit
 * 2. "Adafruit ST7735 and ST7789 Library" by Adafruit
 * 3. "WebSockets" by Markus Sattler (v2.4.0+)
 *
 * ARCHITECTURAL SUMMARY (PHASE 2a COMPLIANT):
 * - Core 0: Real-time deterministic I2S audio capture (INMP441) and playback (MAX98357A)
 *           with Single-Pole High-Pass DC Offset filter & Soft-Clipping DSP.
 * - Core 1: WiFi, WebSocketsClient gateway connection, JSON state sync, and ST7735 UI.
 * - Software Echo Gating (Half-Duplex VAD): Mic streaming is automatically muted when
 *   AI is speaking, permanently preventing the acoustic screech & self-interruption loop.
 * - Air-Gapped Cloud Gateway: No private Agora secrets stored in ESP32 flash! All auth
 *   and tokens are proxied through our Render backend at /api/audio/stream.
 *
 * PINOUT CONFIGURATION:
 * --------------------------------------------------------------------------------------
 * ST7735 1.8" TFT (128x160 SPI) - J1 Solder Shorted -> 3.3V Operation!
 *   - 6-VCC -> 3.3V (CRITICAL: J1 is shorted, 3.3V ONLY!)
 *   - 8-GND -> GND
 *   - 7-BL  -> 3.3V (Backlight)
 *   - 5-CLK -> GPIO 12 (SPI SCLK)
 *   - 4-DIN -> GPIO 11 (SPI MOSI)
 *   - 3-D/C -> GPIO 10 (Data/Command Select)
 *   - 2-CS  -> GPIO 9  (Chip Select)
 *   - 1-RST -> GPIO 13 (Hardware Reset)
 *
 * INMP441 Microphone (I2S0 - RX):
 *   - VDD -> 3.3V
 *   - GND -> GND
 *   - L/R -> GND (Left Channel Select)
 *   - WS  -> GPIO 1
 *   - SCK -> GPIO 2
 *   - SD  -> GPIO 8
 *
 * MAX98357A I2S Amplifier (I2S1 - TX):
 *   - Vin  -> 5V (or VBUS from USB)
 *   - GND  -> GND
 *   - LRC  -> GPIO 16
 *   - BCLK -> GPIO 17
 *   - DIN  -> GPIO 18
 *   - SD   -> 3.3V (Pull HIGH to enable amp)
 *   - GAIN -> Floating (9dB default)
 *   - Speaker (+) -> Red Wire
 *   - Speaker (-) -> Black Wire (Do NOT connect to GND!)
 *
 * BOOT BUTTON: GPIO 0 (Push to toggle session or reconnect)
 * ======================================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>
#include <Preferences.h>
#include <math.h>

// --------------------------------------------------------------------------------------
// 1. CONFIGURATION (Set your WiFi & Gateway Endpoint)
// --------------------------------------------------------------------------------------
// Replace with your local WiFi credentials
const char* DEFAULT_WIFI_SSID     = "YOUR_WIFI_SSID";
const char* DEFAULT_WIFI_PASS     = "YOUR_WIFI_PASSWORD";

// Cloud Gateway Host (Use your deployed Render domain or local development IP)
// Examples:
// - Cloud: "mum-ai.onrender.com" (Port 443 with WSS)
// - Local: "192.168.1.50" (Port 3000 with WS)
const char* GATEWAY_HOST          = "mum-ai.onrender.com";
const int   GATEWAY_PORT          = 443;
const char* GATEWAY_PATH          = "/api/audio/stream";
const bool  GATEWAY_USE_SSL       = (GATEWAY_PORT == 443);

// --------------------------------------------------------------------------------------
// 2. PIN DEFINITIONS (Octal PSRAM Safe Zones)
// --------------------------------------------------------------------------------------
#define TFT_CS          9
#define TFT_DC          10
#define TFT_MOSI        11
#define TFT_SCLK        12
#define TFT_RST         13

#define I2S_MIC_PORT    I2S_NUM_0
#define I2S_MIC_WS      1
#define I2S_MIC_SCK     2
#define I2S_MIC_SD      8

#define I2S_SPK_PORT    I2S_NUM_1
#define I2S_SPK_LRC     16
#define I2S_SPK_BCLK    17
#define I2S_SPK_DIN     18

#define BUTTON_BOOT_PIN 0

// --------------------------------------------------------------------------------------
// 3. AUDIO & DSP CONSTANTS
// --------------------------------------------------------------------------------------
#define AUDIO_SAMPLE_RATE     16000   // 16 kHz Standard for Agora & Gemini
#define FRAME_SAMPLES         256     // 16ms frames
#define MIC_BIT_SHIFT         14      // +12dB analog gain emulation
#define MIC_DC_FILTER_ALPHA   0.05f   // Single-pole high-pass DC bias remover
#define MIC_SOFT_CLIP_THRESH  32000   // Prevent 16-bit clipping

// --------------------------------------------------------------------------------------
// 4. GLOBAL OBJECTS & STATE
// --------------------------------------------------------------------------------------
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);
WebSocketsClient webSocket;
Preferences preferences;

enum DeviceState {
    STATE_BOOTING,
    STATE_WIFI_CONNECTING,
    STATE_GATEWAY_CONNECTING,
    STATE_LISTENING,
    STATE_THINKING,
    STATE_SPEAKING,
    STATE_ERROR
};

volatile DeviceState currentState = STATE_BOOTING;
volatile bool isAiSpeaking = false;
volatile unsigned long lastSpeechTime = 0;

// DSP Buffers
int32_t rawMicBuffer[FRAME_SAMPLES];
int16_t cleanPcmBuffer[FRAME_SAMPLES];
static float dcOffset = 0.0f;

// Outbound Audio Ring Buffer / Queue for Core 0 -> Core 1 FreeRTOS Handshake
QueueHandle_t outboundAudioQueue = NULL;
#define QUEUE_MAX_FRAMES 12

// --------------------------------------------------------------------------------------
// 5. UI DISPLAY ROUTINES (ST7735 128x160)
// --------------------------------------------------------------------------------------
void drawBaseUI() {
    tft.fillScreen(ST77XX_BLACK);
    
    // Top App Bar
    tft.fillRect(0, 0, 160, 24, 0x10A2); // Navy header
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);
    tft.setCursor(8, 8);
    tft.println("MUM AI COMPANION");

    // Top Status Pill
    tft.fillRoundRect(102, 4, 52, 16, 3, ST77XX_BLUE);
    tft.setCursor(108, 8);
    tft.setTextColor(ST77XX_WHITE);
    tft.println("CONNECT");

    // Status Card Box
    tft.fillRoundRect(6, 30, 148, 68, 4, 0x18E3);
    tft.drawRoundRect(6, 30, 148, 68, 4, ST77XX_WHITE);

    // Initial Status Text
    tft.setCursor(14, 38);
    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(1);
    tft.println("SYSTEM BOOT");
    tft.drawFastHLine(14, 50, 132, 0x4208);
    tft.setCursor(14, 58);
    tft.setTextColor(ST77XX_WHITE);
    tft.println("Starting network...");

    // VU Meter Box
    tft.drawRect(6, 106, 148, 18, ST77XX_WHITE);
    tft.fillRect(7, 107, 146, 16, 0x0841);
}

void updateDisplayCard(const char* title, const char* detail, uint16_t badgeColor) {
    tft.fillRoundRect(6, 30, 148, 68, 4, 0x18E3);
    tft.drawRoundRect(6, 30, 148, 68, 4, badgeColor);

    tft.fillRoundRect(12, 36, 8, 8, 2, badgeColor);
    tft.setCursor(26, 36);
    tft.setTextColor(badgeColor);
    tft.setTextSize(1);
    tft.println(title);

    tft.drawFastHLine(14, 50, 132, 0x4208);
    tft.setCursor(14, 58);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);
    tft.println(detail);
}

void updateVUMeter(float rms) {
    static int prevWidth = 0;
    int barWidth = (int)((rms / 3000.0f) * 144.0f);
    if (barWidth > 144) barWidth = 144;
    if (barWidth < 2) barWidth = 2;

    if (abs(barWidth - prevWidth) >= 3) {
        uint16_t color = (rms > 1600) ? ST77XX_GREEN : (rms > 600 ? ST77XX_YELLOW : ST77XX_CYAN);
        tft.fillRect(8, 108, barWidth, 14, color);
        if (barWidth < prevWidth) {
            tft.fillRect(8 + barWidth, 108, 144 - barWidth, 14, 0x0841);
        }
        prevWidth = barWidth;
    }
}

// --------------------------------------------------------------------------------------
// 6. AUDIO DRIVERS & PLAYBACK
// --------------------------------------------------------------------------------------
bool initMicrophone() {
    i2s_config_t config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = AUDIO_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = FRAME_SAMPLES,
        .use_apll = true,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pins = {
        .bck_io_num = I2S_MIC_SCK,
        .ws_io_num = I2S_MIC_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_MIC_SD
    };

    esp_err_t err = i2s_driver_install(I2S_MIC_PORT, &config, 0, NULL);
    if (err != ESP_OK) return false;
    return (i2s_set_pin(I2S_MIC_PORT, &pins) == ESP_OK);
}

bool initAmplifier() {
    i2s_config_t config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
        .sample_rate = AUDIO_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = FRAME_SAMPLES,
        .use_apll = false,
        .tx_desc_auto_clear = true,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pins = {
        .bck_io_num = I2S_SPK_BCLK,
        .ws_io_num = I2S_SPK_LRC,
        .data_out_num = I2S_SPK_DIN,
        .data_in_num = I2S_PIN_NO_CHANGE
    };

    esp_err_t err = i2s_driver_install(I2S_SPK_PORT, &config, 0, NULL);
    if (err != ESP_OK) return false;
    return (i2s_set_pin(I2S_SPK_PORT, &pins) == ESP_OK);
}

// Plays incoming 16-bit mono audio through MAX98357A with stereo duplication
void writeStereoAmp(const int16_t* monoSamples, size_t count) {
    int16_t stereoBuffer[FRAME_SAMPLES * 2];
    size_t written = 0;
    while (written < count) {
        size_t batch = min((size_t)FRAME_SAMPLES, count - written);
        for (size_t i = 0; i < batch; i++) {
            stereoBuffer[i * 2]     = monoSamples[written + i];
            stereoBuffer[i * 2 + 1] = monoSamples[written + i];
        }
        size_t bytesWritten = 0;
        i2s_write(I2S_SPK_PORT, stereoBuffer, batch * 2 * sizeof(int16_t), &bytesWritten, pdMS_TO_TICKS(50));
        written += batch;
    }
}

void playBootChime() {
    float freqs[2] = { 523.25f, 659.25f }; // C5 -> E5
    int durationSamples = (AUDIO_SAMPLE_RATE * 160) / 1000;
    int16_t toneBuf[FRAME_SAMPLES];

    for (int t = 0; t < 2; t++) {
        int played = 0;
        float phase = 0.0f;
        float phaseInc = (2.0f * M_PI * freqs[t]) / AUDIO_SAMPLE_RATE;

        while (played < durationSamples) {
            int chunk = min(FRAME_SAMPLES, durationSamples - played);
            for (int i = 0; i < chunk; i++) {
                float envelope = 1.0f - ((float)(played + i) / durationSamples);
                toneBuf[i] = (int16_t)(sinf(phase) * 11000.0f * envelope);
                phase += phaseInc;
                if (phase >= 2.0f * M_PI) phase -= 2.0f * M_PI;
            }
            writeStereoAmp(toneBuf, chunk);
            played += chunk;
        }
        delay(30);
    }
}

// --------------------------------------------------------------------------------------
// 7. WEBSOCKET EVENT HANDLER (Core 1)
// --------------------------------------------------------------------------------------
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.println("[WS] Disconnected from Mum AI Cloud Gateway.");
            currentState = STATE_GATEWAY_CONNECTING;
            updateDisplayCard("RECONNECTING", "Gateway offline\nRetrying...", ST77XX_YELLOW);
            break;

        case WStype_CONNECTED:
            Serial.println("[WS] Connected to Mum AI Cloud Gateway! Voice session active.");
            currentState = STATE_LISTENING;
            updateDisplayCard("CONNECTED", "Maa Ready!\nSpeak now in Hindi", ST77XX_GREEN);
            // Send join handshake
            webSocket.sendTXT("{\"type\":\"init\",\"device\":\"esp32_maa\",\"channel\":\"mummy-dev\"}");
            break;

        case WStype_TEXT: {
            String msg = String((char*)payload);
            Serial.printf("[WS RECV] %s\n", msg.c_str());

            if (msg.indexOf("\"state\":\"thinking\"") > 0) {
                isAiSpeaking = false;
                currentState = STATE_THINKING;
                updateDisplayCard("THINKING", "Processing with\nGemini 2.5...", ST77XX_ORANGE);
            } else if (msg.indexOf("\"state\":\"speaking\"") > 0) {
                isAiSpeaking = true;
                lastSpeechTime = millis();
                currentState = STATE_SPEAKING;
                updateDisplayCard("SPEAKING", "Maa is speaking...\nPlaying voice", ST77XX_MAGENTA);
            } else if (msg.indexOf("\"state\":\"listening\"") > 0) {
                isAiSpeaking = false;
                currentState = STATE_LISTENING;
                updateDisplayCard("LISTENING", "Maa listening...\nSpeak now", ST77XX_GREEN);
            }
            break;
        }

        case WStype_BIN: {
            // Incoming synthesized speech audio chunk from Cloud
            isAiSpeaking = true;
            lastSpeechTime = millis();
            currentState = STATE_SPEAKING;
            
            size_t sampleCount = length / sizeof(int16_t);
            writeStereoAmp((const int16_t*)payload, sampleCount);
            break;
        }

        default:
            break;
    }
}

// --------------------------------------------------------------------------------------
// 8. CORE 0 FREERTOS TASK: DETERMINISTIC I2S AUDIO READ & DSP
// --------------------------------------------------------------------------------------
void audioDmaTask(void *pvParameters) {
    Serial.println("[CORE 0] I2S Audio DMA & DSP task pinned to Core 0.");

    while (1) {
        size_t bytesRead = 0;
        esp_err_t err = i2s_read(I2S_MIC_PORT, rawMicBuffer, FRAME_SAMPLES * sizeof(int32_t), &bytesRead, pdMS_TO_TICKS(25));

        if (err == ESP_OK && bytesRead > 0) {
            size_t samplesRead = bytesRead / sizeof(int32_t);
            int64_t energySum = 0;

            // DSP Pipeline: DC Filter + 14-bit Gain Shift + Soft Limiter
            for (size_t i = 0; i < samplesRead; i++) {
                int32_t shifted = rawMicBuffer[i] >> MIC_BIT_SHIFT;

                float sample = (float)shifted;
                float filtered = sample - dcOffset;
                dcOffset += filtered * MIC_DC_FILTER_ALPHA;

                int32_t clamped = (int32_t)filtered;
                if (clamped > MIC_SOFT_CLIP_THRESH) clamped = MIC_SOFT_CLIP_THRESH;
                else if (clamped < -MIC_SOFT_CLIP_THRESH) clamped = -MIC_SOFT_CLIP_THRESH;

                cleanPcmBuffer[i] = (int16_t)clamped;
                energySum += (int64_t)cleanPcmBuffer[i] * cleanPcmBuffer[i];
            }

            // Software Acoustic Echo Gate (Half-Duplex VAD Protection):
            // Only enqueue mic audio if the AI is NOT actively speaking!
            bool aiPlaybackCooldown = (millis() - lastSpeechTime < 450);
            if (!isAiSpeaking && !aiPlaybackCooldown) {
                if (outboundAudioQueue != NULL) {
                    xQueueSend(outboundAudioQueue, cleanPcmBuffer, 0); // Non-blocking push
                }
            }
        }
        vTaskDelay(pdMS_TO_TICKS(4)); // Yield CPU
    }
}

// --------------------------------------------------------------------------------------
// 9. SETUP ROUTINE (Core 1)
// --------------------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(800);

    Serial.println();
    Serial.println("===============================================================");
    Serial.println("   Maa (MumAI Companion) - Phase 5 (Step 3): Cloud Node        ");
    Serial.println("===============================================================");

    // Initialize ST7735 Display
    Serial.print("[INIT] Initializing ST7735 Display (128x160)... ");
    tft.initR(INITR_BLACKTAB);
    tft.setRotation(1);
    tft.invertDisplay(false);
    drawBaseUI();
    Serial.println("OK");

    // Initialize Audio Peripherals
    Serial.print("[INIT] Initializing MAX98357A Amplifier... ");
    if (initAmplifier()) {
        Serial.println("OK");
        playBootChime();
    } else {
        Serial.println("FAILED!");
    }

    Serial.print("[INIT] Initializing INMP441 Microphone... ");
    if (initMicrophone()) {
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }

    // Allocate FreeRTOS Queue for 16-bit PCM Audio Frames
    outboundAudioQueue = xQueueCreate(QUEUE_MAX_FRAMES, sizeof(cleanPcmBuffer));

    // Launch Core 0 Audio DMA Task
    xTaskCreatePinnedToCore(
        audioDmaTask,
        "AudioDmaTask",
        4096,
        NULL,
        10,            // High priority
        NULL,
        0              // Pinned to Core 0
    );

    // Boot Button
    pinMode(BUTTON_BOOT_PIN, INPUT_PULLUP);

    // Initialize WiFi
    Serial.printf("[WIFI] Connecting to '%s'...\n", DEFAULT_WIFI_SSID);
    updateDisplayCard("WIFI", DEFAULT_WIFI_SSID, ST77XX_YELLOW);
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASS);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 35) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WIFI] Connected! Assigned IP: %s\n", WiFi.localIP().toString().c_str());
        updateDisplayCard("WIFI OK", WiFi.localIP().toString().c_str(), ST77XX_CYAN);
        
        // Connect to Mum AI Cloud WebSocket Gateway
        Serial.printf("[GATEWAY] Connecting to %s://%s:%d%s\n", 
                      GATEWAY_USE_SSL ? "wss" : "ws", GATEWAY_HOST, GATEWAY_PORT, GATEWAY_PATH);
        
        if (GATEWAY_USE_SSL) {
            webSocket.beginSSL(GATEWAY_HOST, GATEWAY_PORT, GATEWAY_PATH);
        } else {
            webSocket.begin(GATEWAY_HOST, GATEWAY_PORT, GATEWAY_PATH);
        }

        webSocket.onEvent(webSocketEvent);
        webSocket.setReconnectInterval(3000);
        webSocket.enableHeartbeat(15000, 3000, 2);
    } else {
        Serial.println("[WIFI] Connection failed. Update credentials or check router.");
        updateDisplayCard("WIFI FAIL", "Check credentials\nin sketch", ST77XX_RED);
        currentState = STATE_ERROR;
    }
}

// --------------------------------------------------------------------------------------
// 10. MAIN EXECUTION LOOP (Core 1)
// --------------------------------------------------------------------------------------
int16_t transmitBuffer[FRAME_SAMPLES];
unsigned long lastUiRefresh = 0;

void loop() {
    // Service WebSocket network loop
    webSocket.loop();

    // Pull filtered PCM frames from Core 0 queue and stream over WebSocket
    if (outboundAudioQueue != NULL && xQueueReceive(outboundAudioQueue, transmitBuffer, 0)) {
        if (webSocket.isConnected() && !isAiSpeaking) {
            // Transmit clean binary 16-bit PCM chunk (512 bytes)
            webSocket.sendBIN((uint8_t*)transmitBuffer, FRAME_SAMPLES * sizeof(int16_t));
        }

        // Calculate RMS energy for on-screen VU meter
        int64_t sum = 0;
        for (int i = 0; i < FRAME_SAMPLES; i++) {
            sum += (int64_t)transmitBuffer[i] * transmitBuffer[i];
        }
        float rms = sqrtf((float)sum / (float)FRAME_SAMPLES);

        // Update display VU meter at ~25 FPS
        if (millis() - lastUiRefresh >= 40) {
            lastUiRefresh = millis();
            updateVUMeter(rms);
        }
    }

    // Clear speaking state after speech timeout
    if (isAiSpeaking && (millis() - lastSpeechTime > 800)) {
        isAiSpeaking = false;
        if (currentState == STATE_SPEAKING) {
            currentState = STATE_LISTENING;
            updateDisplayCard("LISTENING", "Maa listening...\nSpeak now", ST77XX_GREEN);
        }
    }
}
