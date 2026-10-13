import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import type { StorageAdapter } from "./types.ts"

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string }

const PRESIGN_SECONDS = 3600

export function createR2Storage(cfg: R2Config): StorageAdapter {
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // Newer SDKs add a CRC32 checksum to presigned URLs. A browser PUT does not send it, so R2 rejects the upload.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
  const publicBase = cfg.publicUrl.replace(/\/$/, "")

  return {
    kind: "r2",
    async presignPut(key, contentType) {
      // Photos go through the app (/api/upload), so the browser never needs bucket CORS for them.
      if (contentType.startsWith("image/")) return { url: `/api/upload/${key}`, method: "PUT", headers: { "Content-Type": contentType } }
      const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }), {
        expiresIn: PRESIGN_SECONDS,
      })
      return { url, method: "PUT", headers: { "Content-Type": contentType } }
    },
    async head(key) {
      try {
        const r = await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }))
        return { size: Number(r.ContentLength ?? 0) }
      } catch (e) {
        if ((e as { name?: string }).name === "NotFound" || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
        throw e
      }
    },
    async get(key) {
      const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
      return Buffer.from(await r.Body!.transformToByteArray())
    },
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
    },
    publicUrl: (key) => `${publicBase}/${key}`,
  }
}
