# GrowRoll relay game server (Phase 2) — runs on Oracle Cloud Always Free VM.
# Build context = repo root (needs the pnpm workspace to resolve @growroll/shared).
FROM node:22-slim

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install deps first (better layer caching)
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --filter @growroll/server... --frozen-lockfile=false

# Copy sources
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY tsconfig.base.json ./

ENV PORT=8080
EXPOSE 8080

CMD ["pnpm", "--filter", "@growroll/server", "start"]
