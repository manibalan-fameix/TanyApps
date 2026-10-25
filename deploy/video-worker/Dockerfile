# TanyApps video worker: converts uploaded walkaround videos to HLS (360p/720p) + poster and checks which angles they show.
# NOT deployed anywhere yet (no host exists): see docs/release/video-worker-hosting.md for the launch checklist.
#
# Build from the repository root:   docker build -f deploy/video-worker/Dockerfile -t tanyapps-video-worker .
# Run (secrets come from the platform's secret store, never from this image):
#   docker run --rm --memory=2g --env-file <your secrets file> tanyapps-video-worker
FROM node:24-bookworm-slim

# ffmpeg and ffprobe are the whole point of this host.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -version | head -1 && ffprobe -version | head -1

RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Only what the worker imports (the job code, the schema, storage and the video helpers), not the whole web app.
COPY workers ./workers
COPY lib ./lib
COPY tsconfig.json ./

ENV NODE_ENV=production
# The worker needs: DATABASE_URL (the DIRECT Neon host, not the pooler), R2_* keys, ENCRYPTION_KEY, VISION_API_KEY (optional).
# Run as an unprivileged user; tini forwards SIGTERM so pg-boss can finish its current job (the worker stops gracefully).
RUN useradd --system --uid 10001 worker && mkdir -p /tmp/work && chown worker /tmp/work
USER worker
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "workers/index.ts"]
