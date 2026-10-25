# Walkaround video processing: what it needs, and its launch status

**Launch status: BLOCKED.** Processing a walkaround video (HLS 360p/720p, poster, missing-angle check) needs a host that does not exist
yet, and the whole pipeline has never run with a real ffmpeg. Dealers can upload a walkaround, and the original file is kept safely in R2,
but nothing will convert it until a worker host is running. Do not announce or sell the feature until the checklist below passes.

## Why Cloudflare Workers cannot run it

- **The consumer** (`workers/index.ts`, `pnpm worker`) is a long-lived Node process: it needs `ffmpeg` and `ffprobe` on the PATH, writes
  temporary files, and holds the whole original in memory (400 MB cap, `workers/video.ts`). Workers cannot run ffmpeg.
- **The producer** used to start a `pg-boss` client from inside the web request (`getBoss()` in `lib/jobs/boss.ts`): a TCP connection pool,
  a schema migration and maintenance timers, cached in a module global. Workers cannot share an I/O object between requests, and
  `pg-boss` is built for a process that stays alive. This was never verified in Workers and is assumed not to work.

## How it behaves now

| Situation | What happens |
|---|---|
| Running on Cloudflare Workers (default) | The app does **not** try to reach pg-boss. The video is marked `uploaded` (original safe, waiting) and `video_not_queued{reason=workers_runtime}` is counted. |
| `VIDEO_QUEUE_ENABLED=0` | Same, everywhere. Use it to switch queueing off. |
| `VIDEO_QUEUE_ENABLED=1` | Tries even inside Workers. Only set it after proving pg-boss works there in a real Workers run. |
| Node (local development, or the worker host) | Queues the job; on failure the video stays `uploaded` and `video_not_queued{reason=error}` is counted. Never left `processing`. |
| The worker host starts (and every minute after) | `requeueWaitingVideos` claims each `uploaded` video (`uploaded -> processing`, conditional) and queues it. If queueing fails it goes back to `uploaded`. Safe to run twice. |
| The worker fails a job | The media becomes `failed`; pg-boss retries with back-off (3 times). |

States: `pending` (slot created) -> `uploaded` (original in R2; **waiting for processing**) -> `processing` (queued or running) -> `ready`
or `failed`. The dealer's page shows "processing" for `uploaded` as well as `processing`; it does not poll forever for `uploaded`.

## What the host needs

- Node 22.12 or newer; `ffmpeg` and `ffprobe` installed; roughly 1 GB of memory per concurrent job (the original is read fully into memory).
- `DATABASE_URL`: the **direct** (non-pooler) Neon connection string. pg-boss uses session-level features and creates its own `pgboss` schema.
  A transaction pooler is not suitable **[verify in Neon's and pg-boss's documentation]**. Neon scale-to-zero will not apply while the worker polls.
- The R2 keys (`R2_*`), `ENCRYPTION_KEY`, and `VISION_API_KEY` for the angle check.
- A supervisor that restarts it (systemd, a container platform, or similar) and captures its logs. It handles SIGTERM gracefully.
- Cloudflare Containers or a small VM are both candidates **[verify current Cloudflare Containers capabilities and pricing]**. Nothing here chooses one.

## Checklist before the feature can be called launched

1. A host exists and `pnpm worker` runs on it, with `ffmpeg -version` working.
2. A real walkaround video (not a fake) is uploaded in staging and reaches `ready`, with an HLS playlist, poster and angle analysis.
3. Kill the worker mid-job; confirm the job is retried and the media ends `ready` or `failed`, never stuck.
4. Upload while the worker is stopped; start it; confirm the waiting video is picked up within a minute.
5. Memory for the largest allowed upload (400 MB) fits the host.
6. An alert on `video_not_queued` and on media `failed`.
