/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGORA_APP_ID?: string;
  readonly VITE_FIREBASE_CONFIG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
