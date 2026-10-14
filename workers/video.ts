import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { eq } from "drizzle-orm"

import type { VisionClient, VisionImage } from "../lib/ai/vision.ts"
import { carMedia } from "../lib/db/schema/index.ts"
import { scopedDb } from "../lib/db/scoped.ts"
import type { VideoJob } from "../lib/jobs/boss.ts"
import { videoOutputKeys } from "../lib/media/keys.ts"
import type { StorageAdapter } from "../lib/storage/types.ts"
import { analyseAngles } from "../lib/video/analysis.ts"
import { RENDITIONS, hlsArgs, masterPlaylist, parseProbe, posterArgs, probeArgs, sampleFramesArgs } from "../lib/video/ffmpeg.ts"

const execFileAsync = promisify(execFile)
export type Exec = (cmd: "ffmpeg" | "ffprobe", args: string[]) => Promise<{ stdout: string }>
export const realExec: Exec = (cmd, args) => execFileAsync(cmd, args, { maxBuffer: 32 * 1024 * 1024 })

const CONTENT_TYPES: Record<string, string> = { m3u8: "application/vnd.apple.mpegurl", ts: "video/mp2t", jpg: "image/jpeg" }
const FRAME_COUNT = 12

async function* walk(dir: string, base = dir): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full, base)
    else yield path.relative(base, full)
  }
}

/**
 * Turn an uploaded walkaround into streamable HLS (360p and 720p) plus a poster, and check which
 * required angles it shows. Safe to re-run: outputs are overwritten in place.
 *
 * Analysis frames are held in memory only. They are never uploaded, so they can never become
 * listing photos.
 */
export async function processVideoJob(
  job: VideoJob,
  deps: { storage: StorageAdapter; vision: VisionClient | null; exec?: Exec },
): Promise<void> {
  const exec = deps.exec ?? realExec
  const db = scopedDb(job.dealerId)
  const [media] = await db.carMedia.select(eq(carMedia.id, job.mediaId), { limit: 1 })
  if (!media || media.kind !== "video" || media.carId !== job.carId) return // nothing to do, or not ours

  const work = await mkdtemp(path.join(tmpdir(), "tany-video-"))
  try {
    const input = path.join(work, "input" + path.extname(media.r2Key))
    await writeFile(input, await deps.storage.get(media.r2Key))

    const probe = parseProbe((await exec("ffprobe", probeArgs(input))).stdout)
    const out = videoOutputKeys(media.r2Key)
    const hlsDir = path.join(work, "hls")
    for (const r of RENDITIONS) {
      await mkdir(path.join(hlsDir, `${r.height}p`), { recursive: true })
      await exec("ffmpeg", hlsArgs(input, hlsDir, r.height, probe.hasAudio))
    }
    await writeFile(path.join(hlsDir, "master.m3u8"), masterPlaylist(probe))
    for await (const rel of walk(hlsDir)) {
      const ext = rel.split(".").pop() ?? ""
      await deps.storage.put(`${out.hlsDir}/${rel.split(path.sep).join("/")}`, await readFile(path.join(hlsDir, rel)), CONTENT_TYPES[ext] ?? "application/octet-stream")
    }

    const poster = path.join(work, "poster.jpg")
    await exec("ffmpeg", posterArgs(input, poster, probe.durationSec))
    await deps.storage.put(out.poster, await readFile(poster), "image/jpeg")

    let analysis: typeof media.analysis = null
    if (deps.vision) {
      const framesDir = path.join(work, "frames")
      await mkdir(framesDir)
      await exec("ffmpeg", sampleFramesArgs(input, path.join(framesDir, "f%02d.jpg"), FRAME_COUNT, probe.durationSec))
      const frames: VisionImage[] = []
      for (const name of (await readdir(framesDir)).sort()) {
        frames.push({ mediaType: "image/jpeg", base64: (await readFile(path.join(framesDir, name))).toString("base64") })
      }
      const result = await analyseAngles(deps.vision, frames)
      if (result) analysis = { seen: result.seen, missing: result.missing, analysedAt: new Date().toISOString() }
    }

    await db.carMedia.update(
      {
        status: "ready",
        width: probe.width,
        height: probe.height,
        durationSec: Math.round(probe.durationSec),
        ...(analysis ? { analysis } : {}),
      },
      eq(carMedia.id, media.id),
    )
  } catch (e) {
    await db.carMedia.update({ status: "failed" }, eq(carMedia.id, media.id))
    throw e // let pg-boss retry with backoff
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
