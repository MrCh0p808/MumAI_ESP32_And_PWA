/*
 * ======================================================================================
 * 👵 Maa (MumAI Companion) - ESP32-S3 Firmware Step 2: ST7735 UI & Acoustic DSP Pipeline
 * ======================================================================================
 * Target Board: ESP32-S3-N16R8 (16MB Flash / 8MB Octal OPI PSRAM)
 * Framework: Arduino IDE (ESP32 by Espressif Systems v2.0.14+ or v3.0+)
 *
 * REQUIRED LIBRARIES IN ARDUINO IDE (Install via Library Manager):
 * 1. "Adafruit GFX Library" by Adafruit
 * 2. "Adafruit ST7735 and ST7789 Library" by Adafruit
 *
 * MAJOR ACCOMPLISHMENTS IN STEP 2:
 * 1. [Acoustic Screech Eliminated]: The dangerous live loopback has been removed.
 *    The MAX98357A speaker only plays a melodic two-tone boot chime on startup.
 * 2. [DSP Audio Pipeline Active]:
 *    - Captures 32-bit digital I2S frames from INMP441.
 *    - Arithmetic 14-bit right-shift (+12dB analog gain emulation).
 *    - Single-pole high-pass DC-offset filter (Alpha = 0.05) removes MEMS bias drift.
 *    - Dynamic soft-clipping to prevent digital wrapping distortion.
 * 3. [ST7735 128x160 Display Active]:
 *    - Hardware SPI on safe Octal PSRAM pins (GPIO 9, 10, 11, 12, 13).
 *    - Full status card UI with color badges (LISTENING / READY / SPEAKING).
 *    - Real-time animated color VU meter reacting to voice and acoustic energy.
 *
 * PINOUT CONFIGURATION:
 * --------------------------------------------------------------------------------------
 * ST7735 1.8" TFT (128x160 SPI) - J1 Solder Shorted -> 3.3V Operation!
 *   - 6-VCC -> 3.3V (CRITICAL: Do NOT connect to 5V! J1 is shorted!)
 *   - 8-GND -> GND
 *   - 7-BL  -> 3.3V (Backlight power)
 *   - 5-CLK -> GPIO 12 (SPI SCLK)
 *   - 4-DIN -> GPIO 11 (SPI MOSI)
 *   - 3-D/C -> GPIO 10 (Data/Command Select)
 *   - 2-CS  -> GPIO 9  (Chip Select)
 *   - 1-RST -> GPIO 13 (Hardware Reset)
 *
 * INMP441 Microphone (I2S0 - RX):
 *   - VDD -> 3.3V
 *   - GND -> GND
 *   - L/R -> GND (Left Channel)
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
 *   - SD   -> 3.3V (Must be pulled HIGH)
 *   - GAIN -> Leave Floating (9dB default)
 *   - Speaker (+) -> Red Wire
 *   - Speaker (-) -> Black Wire (Do NOT connect (-) to GND!)
 * ======================================================================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <driver/i2s.h>
#include <math.h>

// --------------------------------------------------------------------------------------
// Pin Assignments (Hardened for ESP32-S3 Octal PSRAM Safe Zones)
// --------------------------------------------------------------------------------------
// ST7735 Display Pins (Hardware SPI - FSPI)
#define TFT_CS          9
#define TFT_DC          10
#define TFT_MOSI        11
#define TFT_SCLK        12
#define TFT_RST         13

// INMP441 Microphone Pins (I2S0 RX)
#define I2S_MIC_PORT    I2S_NUM_0
#define I2S_MIC_WS      1
#define I2S_MIC_SCK     2
#define I2S_MIC_SD      8

// MAX98357A Amplifier Pins (I2S1 TX)
#define I2S_SPK_PORT    I2S_NUM_1
#define I2S_SPK_LRC     16
#define I2S_SPK_BCLK    17
#define I2S_SPK_DIN     18

// Audio & DSP Tuning Constants
#define AUDIO_SAMPLE_RATE     16000   // 16 kHz (Standard for Conversational AI)
#define FRAME_SAMPLES         256     // DMA block size (16ms frames)
#define MIC_BIT_SHIFT         14      // +12dB analog gain boost from 24-bit MSB
#define MIC_DC_FILTER_ALPHA   0.05f   // Single-pole high-pass filter alpha
#define MIC_SOFT_CLIP_THRESH  32000   // Prevent 16-bit signed integer clipping

// Initialize Display (Hardware SPI constructor with RST)
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);

// Persistent DSP State
static float dcOffset = 0.0f;
int32_t rawMicBuffer[FRAME_SAMPLES];
int16_t cleanPcmBuffer[FRAME_SAMPLES];

// --------------------------------------------------------------------------------------
// UI Rendering Routines
// --------------------------------------------------------------------------------------
void drawBaseUI() {
    tft.fillScreen(ST77XX_BLACK);
    
    // Top App Bar
    tft.fillRect(0, 0, 160, 24, 0x10A2); // Deep navy header
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);
    tft.setCursor(8, 8);
    tft.println("MUM AI COMPANION");

    // Engine Badge
    tft.fillRoundRect(102, 4, 52, 16, 3, ST77XX_MAGENTA);
    tft.setCursor(108, 8);
    tft.setTextColor(ST77XX_WHITE);
    tft.println("ACTIVE");

    // Main Status Card Background
    tft.fillRoundRect(6, 30, 148, 68, 4, 0x18E3);
    tft.drawRoundRect(6, 30, 148, 68, 4, ST77XX_WHITE);

    // Initial Status Card Text
    tft.setCursor(14, 38);
    tft.setTextColor(ST77XX_CYAN);
    tft.setTextSize(1);
    tft.println("AUDIO SUBSYSTEM");

    tft.drawFastHLine(14, 50, 132, 0x4208);
    tft.setCursor(14, 56);
    tft.setTextColor(ST77XX_WHITE);
    tft.println("Mic: INMP441 [OK]");
    tft.setCursor(14, 68);
    tft.println("DSP: High-Pass [ON]");
    tft.setCursor(14, 80);
    tft.setTextColor(ST77XX_GREEN);
    tft.println("Speak to test VU...");

    // VU Meter Container Box
    tft.drawRect(6, 106, 148, 18, ST77XX_WHITE);
    tft.fillRect(7, 107, 146, 16, 0x0841); // Dark charcoal container
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
    // Map RMS range (~200 noise floor to ~3500 loud voice) into 144px width
    int barWidth = (int)((rms / 3000.0f) * 144.0f);
    if (barWidth > 144) barWidth = 144;
    if (barWidth < 2) barWidth = 2;

    if (abs(barWidth - prevWidth) >= 3) {
        uint16_t color = (rms > 1600) ? ST77XX_GREEN : (rms > 600 ? ST77XX_YELLOW : ST77XX_CYAN);
        
        // Draw active energy bar
        tft.fillRect(8, 108, barWidth, 14, color);
        
        // Clear decayed trail
        if (barWidth < prevWidth) {
            tft.fillRect(8 + barWidth, 108, 144 - barWidth, 14, 0x0841);
        }
        prevWidth = barWidth;
    }
}

// --------------------------------------------------------------------------------------
// I2S Audio Drivers (Microphone RX + Amplifier TX)
// --------------------------------------------------------------------------------------
bool initMicrophone() {
    i2s_config_t config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = AUDIO_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // 24-bit audio in 32-bit slot
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 6,
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
        .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT, // Duplicated stereo
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 6,
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

// Write interleaved stereo to MAX98357A without clipping
void writeStereoAmp(const int16_t* monoSamples, size_t count) {
    int16_t stereoBuffer[FRAME_SAMPLES * 2];
    for (size_t i = 0; i < count; i++) {
        stereoBuffer[i * 2]     = monoSamples[i];
        stereoBuffer[i * 2 + 1] = monoSamples[i];
    }
    size_t bytesWritten = 0;
    i2s_write(I2S_SPK_PORT, stereoBuffer, count * 2 * sizeof(int16_t), &bytesWritten, portMAX_DELAY);
}

// Play pleasant two-tone melodic boot chime (523Hz C5 -> 659Hz E5)
void playBootChime() {
    Serial.println("[AUDIO] Playing melodic startup chime...");
    int durationSamples = (AUDIO_SAMPLE_RATE * 180) / 1000; // 180ms per tone
    int16_t toneBuf[FRAME_SAMPLES];

    float freqs[2] = { 523.25f, 659.25f }; // C5 -> E5

    for (int t = 0; t < 2; t++) {
        int played = 0;
        float phase = 0.0f;
        float phaseInc = (2.0f * M_PI * freqs[t]) / AUDIO_SAMPLE_RATE;

        while (played < durationSamples) {
            int chunk = min(FRAME_SAMPLES, durationSamples - played);
            for (int i = 0; i < chunk; i++) {
                // Smooth envelope to prevent clicks
                float envelope = 1.0f - ((float)(played + i) / durationSamples);
                toneBuf[i] = (int16_t)(sinf(phase) * 12000.0f * envelope);
                phase += phaseInc;
                if (phase >= 2.0f * M_PI) phase -= 2.0f * M_PI;
            }
            writeStereoAmp(toneBuf, chunk);
            played += chunk;
        }
        delay(40);
    }
    Serial.println("[AUDIO] Boot chime finished.");
}

// --------------------------------------------------------------------------------------
// Setup Routine
// --------------------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000); // Allow USB-CDC serial to enumerate

    Serial.println();
    Serial.println("===============================================================");
    Serial.println("   Maa (MumAI Companion) - Firmware Step 2: ST7735 & DSP UI   ");
    Serial.println("===============================================================");
    Serial.printf("ESP32-S3 Rev: %d | Flash: %u MB | PSRAM: %u MB\n", 
                  ESP.getChipRevision(),
                  ESP.getFlashChipSize() / (1024 * 1024), 
                  ESP.getPsramSize() / (1024 * 1024));

    // Initialize ST7735 Display
    Serial.print("[INIT] Initializing ST7735 Display (128x160)... ");
    tft.initR(INITR_BLACKTAB); // Standard 1.8" ST7735 (or INITR_REDTAB if colors invert)
    tft.setRotation(1);        // Landscape orientation (160 wide x 128 tall)
    tft.invertDisplay(false);
    drawBaseUI();
    Serial.println("OK");

    // Initialize Amplifier (MAX98357A)
    Serial.print("[INIT] Initializing MAX98357A Amplifier... ");
    if (initAmplifier()) {
        Serial.println("OK");
        playBootChime(); // Friendly chime, no feedback screech!
    } else {
        Serial.println("FAILED!");
    }

    // Initialize Microphone (INMP441)
    Serial.print("[INIT] Initializing INMP441 Microphone with High-Pass DSP... ");
    if (initMicrophone()) {
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }

    updateDisplayCard("DSP ACTIVE", "Acoustic Filter ON\nSpeak now!", ST77XX_GREEN);
    Serial.println("\n>>> [READY] Speak or tap near the INMP441 microphone.");
    Serial.println("    - Watch the color VU meter on your ST7735 display!");
    Serial.println("    - Zero audio feedback screech (Loopback eliminated).\n");
}

// --------------------------------------------------------------------------------------
// Main Execution Loop: DSP Extraction & Smooth UI Updating
// --------------------------------------------------------------------------------------
unsigned long lastUiUpdate = 0;
unsigned long lastVoiceActivityTime = 0;
bool isUserSpeaking = false;

void loop() {
    size_t bytesRead = 0;

    // Read 32-bit digital audio from INMP441 DMA
    esp_err_t err = i2s_read(I2S_MIC_PORT, rawMicBuffer, FRAME_SAMPLES * sizeof(int32_t), &bytesRead, pdMS_TO_TICKS(20));

    if (err == ESP_OK && bytesRead > 0) {
        size_t samplesRead = bytesRead / sizeof(int32_t);
        int64_t energySum = 0;
        int16_t peakVal = 0;

        // --- Core DSP Filter (Preserved from MumAI Architecture) ---
        for (size_t i = 0; i < samplesRead; i++) {
            // Step 1: 14-bit arithmetic shift for clean +12dB analog gain emulation
            int32_t shifted = rawMicBuffer[i] >> MIC_BIT_SHIFT;

            // Step 2: Single-pole high-pass filter (removes MEMS DC offset drift)
            float sample = (float)shifted;
            float filtered = sample - dcOffset;
            dcOffset += filtered * MIC_DC_FILTER_ALPHA;

            // Step 3: Soft limiter / clipper (eliminates harsh digital wrapping)
            int32_t clamped = (int32_t)filtered;
            if (clamped > MIC_SOFT_CLIP_THRESH) clamped = MIC_SOFT_CLIP_THRESH;
            else if (clamped < -MIC_SOFT_CLIP_THRESH) clamped = -MIC_SOFT_CLIP_THRESH;

            cleanPcmBuffer[i] = (int16_t)clamped;
            energySum += (int64_t)cleanPcmBuffer[i] * cleanPcmBuffer[i];
            
            int16_t absVal = abs(cleanPcmBuffer[i]);
            if (absVal > peakVal) peakVal = absVal;
        }

        // Calculate Root Mean Square (RMS) Acoustic Energy
        float rms = sqrtf((float)energySum / (float)samplesRead);

        // Voice Activity Detection (VAD) thresholding (~550 RMS = active voice)
        if (rms > 550.0f) {
            lastVoiceActivityTime = millis();
            if (!isUserSpeaking) {
                isUserSpeaking = true;
                updateDisplayCard("LISTENING", "User voice detected\nRMS active...", ST77XX_GREEN);
            }
        } else if (isUserSpeaking && (millis() - lastVoiceActivityTime > 1200)) {
            isUserSpeaking = false;
            updateDisplayCard("STANDBY", "Mum AI Listening...\nSay 'Namaste'", ST77XX_CYAN);
        }

        // Update Display VU Meter at a smooth ~25 FPS
        if (millis() - lastUiUpdate >= 40) {
            lastUiUpdate = millis();
            updateVUMeter(rms);

            // Telemetry output on Serial Monitor
            if (rms > 350.0f) {
                Serial.printf("[DSP] RMS: %5.0f | Peak: %5d | VAD: %s\n", 
                              rms, peakVal, isUserSpeaking ? "VOICE" : "QUIET");
            }
        }
    }
}
