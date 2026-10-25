# Video worker host (prepared, not provisioned)

Everything needed to run `workers/index.ts` somewhere with ffmpeg. Nothing here creates paid resources; a person chooses the host.

- **Image:** `Dockerfile` (Node 24, ffmpeg, runs unprivileged, graceful stop). Build from the repository root.
- **Secrets:** `DATABASE_URL` (direct Neon host), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `ENCRYPTION_KEY`, optional `VISION_API_KEY`. Use the host's secret store.
- **Size:** about 2 GB of memory (the original is read fully into memory, 400 MB cap) and 2 vCPU for one job at a time.
- **Estimated running cost (order of magnitude; verify current prices):** a small always-on VM or container with 2 vCPU / 2-4 GB is roughly US$15-40 a month. Neon will not scale to zero while the worker polls (it polls every few seconds), so expect the database compute to stay on: a cost to weigh against the feature's value.
- **Before it is called launched:** the checklist in `docs/release/video-worker-hosting.md` (real ffmpeg run, kill mid-job, stopped-worker recovery).
