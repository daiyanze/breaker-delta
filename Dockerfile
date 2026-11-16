# Breaker Delta — self-hosted dynamic instance (P1, route A).
#
#   docker build -t breaker-delta .
#   docker compose up -d          # see docker-compose.yml + .env.example
#
# The image holds the ENGINE only. Your data (editions/, state/,
# config.yaml, track-record.md) lives in the /data volume — the
# engine/data split applies to containers exactly as to repos.

FROM oven/bun:1 AS build
WORKDIR /src
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/fetchers/package.json packages/fetchers/
COPY packages/publisher/package.json packages/publisher/
COPY apps/cli/package.json apps/cli/
COPY apps/extension/package.json apps/extension/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build && bun run bundle

FROM oven/bun:1-slim AS runtime
WORKDIR /app
# Engine-root layout: the CLI finds its root by looking for assets/ +
# config.example.yaml + favicon-cache/ above the bundle, so keep the
# bundle at its canonical apps/cli/dist/ path and the root assets
# beside it.
COPY --from=build /src/apps/cli/dist/breaker-delta.mjs apps/cli/dist/breaker-delta.mjs
COPY --from=build /src/assets assets
COPY --from=build /src/presets presets
COPY --from=build /src/config.example.yaml ./
COPY --from=build /src/config.example.json ./
RUN mkdir -p favicon-cache
ENV PORT=8080
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD bun -e "const j = await (await fetch('http://127.0.0.1:8080/api/health')).json(); process.exit(j.ok ? 0 : 1)"
ENTRYPOINT ["bun", "/app/apps/cli/dist/breaker-delta.mjs", "--data-dir", "/data", "serve"]
