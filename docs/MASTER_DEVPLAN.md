# TTox.Tech Elite Product Council - MASTER DEVPLAN

## 🎯 Core Objective
Build an offline-resilient, ultra-low latency "Maa" (Mother) AI Companion & Caregiver Telemetry portal powered natively by Agora Conversational AI v2, Sarvam AI Indian Dialect TTS, Agora Voiceprint isolation, and Firestore synchronization.

## 🏗️ Architectural Tenets (Council Standard)
1. **Dumb Frontend Doctrine**: Browser handles WebRTC capture, audio playback, and visual HUD. Zero business logic or private credentials in frontend bundles.
2. **Native SD-RTN™ Transport**: Scrape off custom WebSocket raw PCM streaming; use Agora RTC native audio channels directly for 400-800ms full-duplex conversational latency.
3. **Sarvam AI Indian Dialect TTS**: Agora ConvoAI handles ASR + LLM reasoning while routing audio generation to Sarvam AI TTS (`bulbul:v1`) for authentic maternal Hindi/Hinglish warmth.
4. **Voiceprint Isolation**: Rejects bystander noise and television audio by locking VAD to the dependent's vocal tract acoustics.
5. **Zero-Slop UI & Micro-Bundle Budget**: High-contrast, mathematically spaced (<150KB core chunk) single-view interface; Recharts lazy-loaded for caregiver telemetry.
6. **Stateless Compute & Bounded Telemetry**: Render server acts as session token minter and webhook receiver; telemetry buffered and flushed to Firestore once per turn.

## 🗺️ Execution Roadmap
- [x] **PHASE 1: Foundation & BYOK Vault**
  - Firebase applet config & Firestore security rules.
  - Multi-agent token builder & webhook receiver in `server.ts`.
- [x] **PHASE 2: Embedded Hardware Diagnostics**
  - ESP32-S3 I2S pinout verification (INMP441 + MAX98357A + ST7735).
  - Diagnostic audio pass-through & DSP firmware sketches.
- [ ] **PHASE 3: Full-Stack Agora ConvoAI v2 & Sarvam TTS Integration** (CURRENT TARGET)
  - **Module 3.1: Deprecation & Scraping**: Deprecate custom `/api/audio/stream` PCM relay; standardize on Agora WebRTC.
  - **Module 3.2: Voice-First DependentView**: Always-listening Agora RTC mic lifecycle, pre-flight permission & autoplay unlock screen.
  - **Module 3.3: Smooth VU Meter & Dynamic Fluid Orb**: Audio analyzer node ref driving SVG/CSS transforms with zero React re-render lag.
  - **Module 3.4: Sarvam TTS & ConvoAI Join Orchestrator**: Update `server.ts` to dispatch ConvoAI v2 join payload with Sarvam TTS, interruptions, and filler words.
  - **Module 3.5: Voiceprint Enrollment & Isolation**: Integration of voiceprint filtering parameters in ConvoAI agent payload.
  - **Module 3.6: Firestore Telemetry Service (`src/services/telemetryService.ts`)**: Batched logging of turn accuracy, VAD, and TTFA latency metrics.
  - **Module 3.7: Lazy-Loaded Caregiver Analytics**: Code-split Recharts telemetry HUD in `CaregiverView`.
  - **Module 3.8: Firebase Auth Domain Guard**: Domain authorization diagnostic and graceful warning toast.
- [ ] **PHASE 4: Embedded Native Agora RTC Firmware**
  - Transition ESP32-S3 firmware from custom WebSocket to Agora Embedded C/C++ RTC SDK.
- [ ] **PHASE 5: DevSecOps Hardening & Production Release**
  - Mozilla Observatory A+ header enforcement, bundle budget audit (<150KB), and zero-secret commit audit.

