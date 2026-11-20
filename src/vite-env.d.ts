/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_GEOCODING_URL?: string;
  readonly VITE_USE_SUPABASE?: 'true' | 'false';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ENABLE_REALTIME?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
