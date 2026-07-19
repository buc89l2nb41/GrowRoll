# 3D models (GLB)

Place `.glb` files here. They are served at `/models/<filename>.glb` during `pnpm dev`.

**Current prop:** `acorn.glb` (see `packages/shared/src/props.ts`)

`test_acorn.glb` is deprecated (local test only).

Models are loaded from the prop catalog (`PROP_DEFS.model` → `/models/<filename>`).

### Collider authoring

```bash
pnpm analyze-props
```

Prints suggested `colliderHalf` for each GLB (same normalization as in-game). Paste into `packages/shared/src/props.ts` and tune by hand.

### Debug wireframes (dev only)

In `packages/client/.env.local`:

```
VITE_DEBUG_COLLIDERS=true
```

Shows Rapier colliders as wireframes. **Do not set on Vercel.**

> 3D AI Studio / Trellis exports may use **meshopt compression**. The client decoder is built in.

Run `pnpm dev:client` and check the browser console for `[prop] acorn: GLB` or `box fallback`.

### Vercel / production deploy

GLB files are **committed to git** (~0.7 MB total). Vite copies `public/` → `dist/`; Vercel serves `/models/*.glb` like GGPO `/sprites/`.

Excluded from `PROP_DEFS` (in folder but not map pickups): `test_acorn`, `katamari`, `tile_*` (terrain TBD).
