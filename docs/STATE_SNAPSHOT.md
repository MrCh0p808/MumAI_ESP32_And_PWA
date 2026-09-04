# STATE SNAPSHOT: MumAI Companion (ConvoAI v2 & Sarvam TTS Migration)
**Active Git Commit/Phase:** Phase 3 - Agora ConvoAI v2 & Sarvam TTS Architecture [COMPLETED]  
**Target Architecture:** Agora SD-RTN™ (WebRTC) + ConvoAI Edge Cloud + Sarvam TTS + Firebase Firestore  
**Client Targets:** Web PWA (`DependentView` & `CaregiverView`) + ESP32-S3 IoT Audio Node  

---

### Verified Milestone Checklist
- [x] Phase 1: Firebase Auth & Dual-mode Webhook Security in `server.ts`
- [x] Phase 2: Embedded Hardware Diagnostics & I2S Pass-Through Sketches (`firmware/`)
- [x] Agora Skills Knowledge Base: Official Agora Skills repository (github.com/AgoraIO/skills) ingested into `docs/agora-official-skills/`
- [x] ConvoAI Studio Rule Enforced: When `pipeline_id` is provided, Studio acts as single source of truth; ceased injecting invalid `resource_id` provider overrides
- [x] Sarvam ConvoAI v2 Specification: Documented and configured native `vendor: "sarvam"` (OpenAPI spec) and `generic_http` OpenAI-compatible bridge
- [x] Production REST Contract Grounding: Configured exact production parameters (`pipeline_id: b4cf52826990410f90c86ba864e604e7`, Deepgram ASR `67cf85d8-764e-42a1-b43e-36780806c744`, Gemini LLM `b48a37a7-f8a6-4d9c-88ff-a8a0fd0270b0`, ElevenLabs TTS `4fd89f26-95c6-4266-93e8-c14c5879485c`, App ID `d6289000c1bc4e0d9247e44a3b33c138`)
- [x] English Voice Fallback Loop Elimination: Set `failure_message: ""` and synchronized all resource IDs to prevent mismatched project credential decryption failures
- [x] Client-Server App ID Dynamic Relay: Backend returns active `appId` with RTC/RTM tokens, decoupling frontend from manual `.env` requirement
- [x] Architectural Arbitration: Council approved direct Agora SD-RTN™ migration, deprecating custom PCM WebSocket streaming
- [x] Module 3.1: Deprecated raw PCM WebSocket audio relay in `server.ts` in favor of native Agora SD-RTN™
- [x] Module 3.2: Voice-first Always-Listening `DependentView` with pre-flight microphone permissions & autoplay unlock
- [x] Module 3.3: Upgraded `FluidOrb` with concentric animated ripples and distinct visual state indicators (Listening, Thinking, Speaking)
- [x] Module 3.4: Updated `server.ts` ConvoAI v2 `/join` payload with Sarvam AI TTS (`bulbul:v1`), interruptions, and filler words
- [x] Module 3.5: Integrated Agora Voiceprint isolation parameters in ConvoAI and UI status badges
- [x] Module 3.6: Created `src/services/telemetryService.ts` for batched Firestore logging of turn accuracy and latency
- [x] Module 3.7: Created lazy-loaded `CaregiverStats` using `recharts` in `CaregiverView`
- [x] Module 3.8: Added Firebase Auth authorized domain validator in `src/lib/firebase.ts`
- [x] Module 3.9: Migrated production Firestore & Auth configuration to `mum-ai-prod` (owned by `tok2.3t@gmail.com`)
- [x] Module 3.10: Resolved Firestore composite index failure in `subscribeToMemories` via in-memory sorting with safe listener error handling
- [x] Module 3.11: Anchored ConvoAI ASR to Deepgram Nova-3, upgraded TTS to Sarvam Bulbul V3 with instant greeting and automatic ElevenLabs resilient fallback
- [x] Module 3.12: Hardened ConvoAI join handler with automated stale session eviction on `TaskConflict`, eliminating zombie agent channel hijacking
- [x] Module 3.13: Resolved audio silence bug — corrected Sarvam Bulbul V3 speaker from invalid `meera` to validated maternal voice `roopa`, added WebRTC volume enforcement and browser autoplay unlocking

### Active Blockers / Hardware Grounding Notes
- Microphones: Browser user-gesture permission modal safely unlocks AudioContext and requests mic before joining.
- Firebase Auth: Google Sign-In helper dynamically identifies unauthorized hostnames and guides developer to add domain to Firebase Console.
- Sarvam AI API Key: Set `SARVAM_API_KEY` in environment for Sarvam Hindi/Hinglish TTS; seamlessly falls back to pipeline ElevenLabs if unprovided.

### Immediate Next Target
- Verify end-to-end voice loop in staging and live preview.

