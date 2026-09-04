/*
 * ======================================================================================
 * 👵 Maa (MumAI Companion) - ESP32-S3 Hardware Audio Diagnostic & Pass-Through Test
 * ======================================================================================
 * Target Board: ESP32-S3-N16R8 (16MB Flash / 8MB Octal OPI PSRAM)
 * Framework: Arduino IDE (ESP32 by Espressif Systems v2.0.14+ or v3.0+)
 *
 * PURPOSE:
 * 1. Test MAX98357A I2S Amplifier: Outputs a pure 440 Hz test tone for 3 seconds.
 * 2. Test INMP441 I2S Microphone: Reads digital acoustic frames, prints a real-time
 *    ASCII VU meter to Serial Monitor, and plays the captured microphone audio directly
 *    through the speaker in real-time (instant loopback / pass-through).
 * 3. Test Onboard WS2812 RGB LED (GPIO 48): Provides visual state feedback.
 *
 * PINOUT CONFIGURATION:
 * --------------------------------------------------------------------------------------
 * INMP441 Microphone (I2S_NUM_0):
 *   - VDD -> 3.3V (Do NOT connect to 5V!)
 *   - GND -> GND
 *   - L/R -> GND (Left Channel Select)
 *   - WS  -> GPIO 1
 *   - SCK -> GPIO 2
 *   - SD  -> GPIO 8
 *
 * MAX98357A I2S Amplifier (I2S_NUM_1):
 *   - Vin  -> 5V (or VBUS from USB)
 *   - GND  -> GND
 *   - LRC  -> GPIO 16
 *   - BCLK -> GPIO 17
 *   - DIN  -> GPIO 18
 *   - SD   -> 3.3V (CRITICAL: Pull HIGH to enable amplifier!)
 *   - GAIN -> Leave Floating (defaults to 9dB)
 *   - Speaker (+) -> Red Wire
 *   - Speaker (-) -> Black Wire (Do NOT connect (-) to GND!)
 *
 * Onboard WS2812 RGB LED:
 *   - GPIO 48 (Built-in status indicator)
 * ======================================================================================
 */

#include <Arduino.h>
#include <driver/i2s.h>
#include <math.h>

// --------------------------------------------------------------------------------------
// Pin Definitions (Calibrated for ESP32-S3-N16R8 Octal PSRAM Safe Zones)
// --------------------------------------------------------------------------------------
// Microphone (I2S0 - RX)
#define I2S_MIC_PORT        I2S_NUM_0
#define I2S_MIC_WS_PIN      1
#define I2S_MIC_SCK_PIN     2
#define I2S_MIC_SD_PIN      8

// Speaker Amplifier (I2S1 - TX)
#define I2S_SPK_PORT        I2S_NUM_1
#define I2S_SPK_LRC_PIN     16
#define I2S_SPK_BCLK_PIN    17
#define I2S_SPK_DIN_PIN     18

// Built-in RGB LED Pin
#define ONBOARD_RGB_PIN     48

// Audio Configuration
#define SAMPLE_RATE         16000   // 16 kHz (Standard for Agora/Gemini Voice AI)
#define BUFFER_SAMPLE_COUNT 512

// Global Audio Buffer
int32_t micBuffer[BUFFER_SAMPLE_COUNT];
int16_t spkBuffer[BUFFER_SAMPLE_COUNT];

// --------------------------------------------------------------------------------------
// Function: Initialize I2S0 for Microphone Input (INMP441)
// --------------------------------------------------------------------------------------
bool initMicrophone() {
    i2s_config_t i2s_mic_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 transmits 24-bit in 32-bit slot
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = BUFFER_SAMPLE_COUNT,
        .use_apll = true,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t mic_pin_config = {
        .bck_io_num = I2S_MIC_SCK_PIN,
        .ws_io_num = I2S_MIC_WS_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_MIC_SD_PIN
    };

    esp_err_t err = i2s_driver_install(I2S_MIC_PORT, &i2s_mic_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Failed to install I2S Mic driver: 0x%x\n", err);
        return false;
    }

    err = i2s_set_pin(I2S_MIC_PORT, &mic_pin_config);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Failed to set I2S Mic pins: 0x%x\n", err);
        return false;
    }

    return true;
}

// --------------------------------------------------------------------------------------
// Function: Initialize I2S1 for Speaker Output (MAX98357A)
// --------------------------------------------------------------------------------------
bool initSpeaker() {
    i2s_config_t i2s_spk_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = BUFFER_SAMPLE_COUNT,
        .use_apll = true,
        .tx_desc_auto_clear = true,
        .fixed_mclk = 0
    };

    i2s_pin_config_t spk_pin_config = {
        .bck_io_num = I2S_SPK_BCLK_PIN,
        .ws_io_num = I2S_SPK_LRC_PIN,
        .data_out_num = I2S_SPK_DIN_PIN,
        .data_in_num = I2S_PIN_NO_CHANGE
    };

    esp_err_t err = i2s_driver_install(I2S_SPK_PORT, &i2s_spk_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Failed to install I2S Speaker driver: 0x%x\n", err);
        return false;
    }

    err = i2s_set_pin(I2S_SPK_PORT, &spk_pin_config);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Failed to set I2S Speaker pins: 0x%x\n", err);
        return false;
    }

    return true;
}

// --------------------------------------------------------------------------------------
// Test Tone Generator: Pure 440 Hz Sine Wave for Speaker Diagnostics
// --------------------------------------------------------------------------------------
void playTestTone(float frequency, int durationMs) {
    Serial.printf("[DIAGNOSTIC] Playing %.0f Hz test tone for %d ms...\n", frequency, durationMs);
    
    int totalSamples = (SAMPLE_RATE * durationMs) / 1000;
    int samplesPlayed = 0;
    
    int16_t toneBuffer[BUFFER_SAMPLE_COUNT];
    size_t bytesWritten = 0;
    
    float phase = 0.0f;
    float phaseIncrement = (2.0f * M_PI * frequency) / SAMPLE_RATE;
    int16_t amplitude = 12000; // ~35% volume to avoid clipping

    while (samplesPlayed < totalSamples) {
        int chunk = min((int)BUFFER_SAMPLE_COUNT, totalSamples - samplesPlayed);
        for (int i = 0; i < chunk; i++) {
            toneBuffer[i] = (int16_t)(sinf(phase) * amplitude);
            phase += phaseIncrement;
            if (phase >= 2.0f * M_PI) {
                phase -= 2.0f * M_PI;
            }
        }
        i2s_write(I2S_SPK_PORT, toneBuffer, chunk * sizeof(int16_t), &bytesWritten, portMAX_DELAY);
        samplesPlayed += chunk;
    }

    // Zero out output to prevent DC thumps
    memset(toneBuffer, 0, sizeof(toneBuffer));
    i2s_write(I2S_SPK_PORT, toneBuffer, sizeof(toneBuffer), &bytesWritten, portMAX_DELAY);
    Serial.println("[DIAGNOSTIC] Tone playback complete.");
}

// --------------------------------------------------------------------------------------
// Setup Routine
// --------------------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1500); // Allow USB CDC serial to stabilize

    Serial.println();
    Serial.println("===============================================================");
    Serial.println("   Maa (MumAI Companion) - ESP32-S3 Audio Hardware Test        ");
    Serial.println("===============================================================");
    Serial.printf("Chip Model: %s (Rev %d)\n", ESP.getChipModel(), ESP.getChipRevision());
    Serial.printf("Flash Size: %u MB | PSRAM Size: %u MB\n", 
                  ESP.getFlashChipSize() / (1024 * 1024), 
                  ESP.getPsramSize() / (1024 * 1024));
    Serial.println("---------------------------------------------------------------");

    // Initialize Speaker (MAX98357A)
    Serial.print("[INIT] Initializing MAX98357A I2S Amplifier... ");
    if (initSpeaker()) {
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }

    // Initialize Microphone (INMP441)
    Serial.print("[INIT] Initializing INMP441 I2S Microphone... ");
    if (initMicrophone()) {
        Serial.println("OK");
    } else {
        Serial.println("FAILED!");
    }

    // Step 1: Speaker Self-Test
    Serial.println("\n>>> [STEP 1] Testing Speaker Output: Generating 440 Hz Sine Tone...");
    playTestTone(440.0f, 2500); // 2.5 second tone
    delay(500);

    Serial.println("\n>>> [STEP 2] Starting Real-Time Acoustic Pass-Through & VU Meter:");
    Serial.println("    - Speak, tap, or whistle near the INMP441 microphone.");
    Serial.println("    - You should hear your voice echoed in the speaker.");
    Serial.println("    - Watch the live VU bars below:\n");
}

// --------------------------------------------------------------------------------------
// Main Loop: Audio Pass-Through and VU Meter Telemetry
// --------------------------------------------------------------------------------------
unsigned long lastTelemetryTime = 0;

void loop() {
    size_t bytesRead = 0;
    size_t bytesWritten = 0;

    // Read 32-bit acoustic frames from INMP441
    esp_err_t result = i2s_read(I2S_MIC_PORT, micBuffer, sizeof(micBuffer), &bytesRead, portMAX_DELAY);
    
    if (result == ESP_OK && bytesRead > 0) {
        int samplesRead = bytesRead / sizeof(int32_t);
        int64_t sumSquares = 0;
        int32_t peakAmplitude = 0;

        for (int i = 0; i < samplesRead; i++) {
            // INMP441 outputs 24-bit data in MSB-aligned 32-bit word.
            // Shift down by 14 to convert to normalized 16-bit PCM for MAX98357A.
            int32_t sample32 = micBuffer[i] >> 14;

            // Soft clamp to prevent harsh integer clipping
            if (sample32 > 32767) sample32 = 32767;
            if (sample32 < -32768) sample32 = -32768;

            int16_t sample16 = (int16_t)sample32;
            spkBuffer[i] = sample16;

            int32_t absVal = abs(sample16);
            if (absVal > peakAmplitude) peakAmplitude = absVal;
            sumSquares += (int64_t)sample16 * sample16;
        }

        // Output audio back to speaker in real-time
        i2s_write(I2S_SPK_PORT, spkBuffer, samplesRead * sizeof(int16_t), &bytesWritten, portMAX_DELAY);

        // Visual VU Meter on Serial Console (throttled to ~15 Hz)
        if (millis() - lastTelemetryTime >= 65) {
            lastTelemetryTime = millis();
            
            float rms = sqrtf((float)sumSquares / samplesRead);
            int barLength = (int)(rms / 400.0f);
            if (barLength > 40) barLength = 40;

            Serial.printf("[MIC VU] |");
            for (int b = 0; b < barLength; b++) {
                Serial.print("█");
            }
            for (int b = barLength; b < 40; b++) {
                Serial.print(" ");
            }
            Serial.printf("| RMS: %5.0f | Peak: %5d\n", rms, peakAmplitude);
        }
    }
}
