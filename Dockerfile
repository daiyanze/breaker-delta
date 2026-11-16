# Breaker Delta — self-hosted dynamic instance (P2: the vinext web
# app; the P1 CLI serve image is preserved as Dockerfile.cli-serve).
#
#   docker build -t breaker-delta .
#   docker compose up -d          # see docker-compose.yml + .env.example
#
# The image holds the ENGINE only. Your data (editions/, state/,
# config.yaml, track-record.md) lives in the /data volume — the
# engine/data split applies to containers exactly as to repos.
#
# Runtime note: the app server (vinext start) is a Node program and
# the SQLite backend uses node:sqlite, so the runtime stage is
# Node 22; Bun is the build tool.

FROM oven/bun:1 AS build
WORKDIR /src
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/fetchers/package.json packages/fetchers/
COPY packages/publisher/package.json packages/publisher/
COPY apps/cli/package.json apps/cli/
COPY apps/extension/package.json apps/extension/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
WORKDIR /src/apps/web
RUN bun x vite build

FROM node:22-slim AS runtime
WORKDIR /app
# Workspace layout preserved: node_modules' package symlinks are
# relative, and the web app resolves its engine root (plugins/,
# presets/, assets/) as ../.. from apps/web.
COPY --from=build /src/node_modules node_modules
COPY --from=build /src/packages packages
COPY --from=build /src/apps/web apps/web
COPY --from=build /src/plugins plugins
COPY --from=build /src/presets presets
COPY --from=build /src/assets assets
COPY --from=build /src/config.example.yaml ./
COPY --from=build /src/config.example.json ./
ENV PORT=8080
ENV BD_DATA_DIR=/data
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const j = await (await fetch('http://127.0.0.1:8080/api/health')).json(); process.exit(j.ok ? 0 : 1)"
WORKDIR /app/apps/web
ENTRYPOINT ["node", "../../node_modules/vinext/dist/cli.js", "start", "--port", "8080"]
