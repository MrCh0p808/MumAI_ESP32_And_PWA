# STATE SNAPSHOT: MumAI Hardware Companion (ESP32-S3)
**Active Git Commit/Phase:** Phase 5 - Embedded Hardware Verification (Step 1 Audio Loopback)  
**Target Hardware:** ESP32-S3-N16R8 (16MB Flash, 8MB Octal PSRAM)  
**Audio Subsystem:** INMP441 I2S MEMS Mic + MAX98357A I2S Class-D Amp + ST7735 128x160 SPI TFT  

---

### Verified Milestone Checklist
- [x] Phase 1: Dual-mode Webhook Security & HMAC Verification in `server.ts`
- [x] Phase 2: Decoupled Vercel/Render Architecture & Database Schema in `README.md`
- [x] Phase 3: Physical Pinout Audit & Octal PSRAM conflict mitigation
- [x] Phase 4: J1 Jumper 3.3V power routing verified for ST7735 display
- [x] Phase 5 (Step 1): Audio Hardware Diagnostic & Pass-Through Sketch generated (`firmware/Maa_Audio_Hardware_Test/Maa_Audio_Hardware_Test.ino`)

### Active Blockers / Physical Grounding Checks
- Breadboard contact resistance: Ensure header pins on INMP441 and MAX98357A are soldered.
- MAX98357A `SD` (shutdown) must be tied to 3.3V rail.
- INMP441 `L/R` pin must be tied to GND (Left Channel).
- ST7735 `VCC` must be connected to 3.3V (due to J1 solder short).

### Immediate Next Target
- User flashes `Maa_Audio_Hardware_Test.ino` via Arduino IDE.
- Verify Phase A (440Hz Sine Wave tone from speaker) and Phase B (Live VU meter & audio pass-through from mic).
