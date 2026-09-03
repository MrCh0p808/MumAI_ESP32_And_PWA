# TTox.Tech Elite Product Council - MASTER DEVPLAN

## 🎯 Core Objective
Build an offline-capable, highly resilient "Maa" (Mother) AI Companion & Caregiver Telemetry portal. 

## 🏗️ Architectural Tenets
1. **Zero-Secret Frontend**: Browser handles UI/mic only. All keys in backend/vault.
2. **SSOT Configuration**: Agora Console dictates pipeline (ASR/LLM/TTS) via `pipeline_id`.
3. **Episodic Memory**: Agent must remember users across sessions (Firestore).
4. **Anti-Slop UI**: Strict premium dark-glassmorphism. No generic AI templates.

## 🗺️ Execution Phases
- [x] **PHASE 1**: Project Initialization & Firebase Auth Setup
- [x] **PHASE 2**: Core WebRTC Audio Loop & BYOK Credential Vault Sync
- [ ] **PHASE 3**: Cognitive Hardening (Memory, Dynamic Variables, Split-Brain Purge)
- [ ] **PHASE 4**: Caregiver Telemetry & Real-time Webhooks
- [ ] **PHASE 5**: DevSecOps Hardening & Bundle Optimization
