/**
 * S3 sink — AWS S3 and S3-compatible stores (MinIO, Cloudflare R2, B2, …).
 *
 * `@aws-sdk/client-s3` is loaded on first use. A custom `endpoint` plus
 * `forcePathStyle` covers the compatible stores; without access keys the
 * SDK's default credential chain applies (instance role, IRSA, env).
 *
 * Files are at most ~128 MB (the worker's flush budget), so a single
 * PutObject is enough — no multipart upload.
 */
import type { HostGuard, ObjectStoreSink, S3Config, S3Secrets } from '../types'
import { normalizePrefix } from '../types'
import { connectionTestPath } from './common'

/** The slice of `S3Client` the sink uses; tests pass a fake. */
export interface S3ClientLike {
  send(command: unknown): Promise<unknown>
  destroy?(): void
}

export interface S3SinkDeps {
  hostGuard: HostGuard
  /** Build the client. Default: the real `S3Client`. */
  clientFactory?: (cfg: {
    region: string
    endpoint?: string
    forcePathStyle: boolean
    credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
  }) => Promise<S3ClientLike>
  /** Build a PutObject command. Default: the real `PutObjectCommand`. */
  putCommand?: (input: {
    Bucket: string
    Key: string
    Body: Uint8Array
    ContentType: string
  }) => Promise<unknown>
  /** Build a DeleteObject command. Default: the real `DeleteObjectCommand`. */
  deleteCommand?: (input: { Bucket: string; Key: string }) => Promise<unknown>
}

async function defaultClient(
  cfg: Parameters<NonNullable<S3SinkDeps['clientFactory']>>[0],
): Promise<S3ClientLike> {
  const { S3Client } = await import('@aws-sdk/client-s3')
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: cfg.credentials,
  }) as unknown as S3ClientLike
}

async function defaultPut(input: {
  Bucket: string
  Key: string
  Body: Uint8Array
  ContentType: string
}): Promise<unknown> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  return new PutObjectCommand(input)
}

async function defaultDelete(input: { Bucket: string; Key: string }): Promise<unknown> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  return new DeleteObjectCommand(input)
}

export async function createS3Sink(
  config: S3Config,
  secrets: S3Secrets,
  deps: S3SinkDeps,
): Promise<ObjectStoreSink> {
  if (config.endpoint) await deps.hostGuard(new URL(config.endpoint).hostname)
  const client = await (deps.clientFactory ?? defaultClient)({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials:
      secrets.accessKeyId && secrets.secretAccessKey
        ? {
            accessKeyId: secrets.accessKeyId,
            secretAccessKey: secrets.secretAccessKey,
            ...(secrets.sessionToken ? { sessionToken: secrets.sessionToken } : {}),
          }
        : undefined,
  })
  const put = deps.putCommand ?? defaultPut
  const prefix = normalizePrefix(config.prefix)

  async function writeFile(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await client.send(
      await put({
        Bucket: config.bucket,
        Key: `${prefix}${path}`,
        Body: bytes,
        ContentType: contentType,
      }),
    )
  }

  return {
    kind: 'object_store',
    writeFile,
    async deleteFile(path: string) {
      // S3 DeleteObject succeeds for a missing key.
      await client.send(
        await (deps.deleteCommand ?? defaultDelete)({
          Bucket: config.bucket,
          Key: `${prefix}${path}`,
        }),
      )
    },
    async test() {
      await writeFile(
        connectionTestPath(),
        new TextEncoder().encode(JSON.stringify({ ok: true, at: new Date().toISOString() })),
        'application/json',
      )
    },
    async close() {
      client.destroy?.()
    },
  }
}
