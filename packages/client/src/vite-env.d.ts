/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  /** GLB path for map/attach props, e.g. /models/test_acorn.glb */
  readonly VITE_PROP_MODEL?: string;
  /** Dev only: draw Rapier collider wireframes (not set on Vercel). */
  readonly VITE_DEBUG_COLLIDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
