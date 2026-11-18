/**
 * The staging area a loader writes Parquet files to before the warehouse
 * pulls them in. It is one of the Phase 3 object-store sinks (S3, GCS,
 * Azure Blob) rooted at the stage URL's prefix, plus the URL each file has
 * as the warehouse sees it.
 */
import { createAzureBlobSink } from '../sinks/azure'
import { createGcsSink } from '../sinks/gcs'
import { createS3Sink, type S3SinkDeps } from '../sinks/s3'
import { DestinationConfigError, type HostGuard, type ObjectStoreSink } from '../types'
import type { StageSecretValues } from './schemas'
import { parseStageUrl, renderStageUrl, type ParsedStageUrl, type UrlDialect } from './stage-url'

/** A staged file, by its path under the stage and by warehouse URL. */
export interface StagedFile {
  /** Path relative to the stage prefix, e.g. `_opensteward_stage/os_crm_contacts/<id>.parquet`. */
  path: string
  /** The file's directory as the warehouse spells it (ends in `/`). */
  dirUrl: string
  /** The file name inside `dirUrl`. */
  name: string
  /** `dirUrl + name`. */
  url: string
  /** Size in bytes. */
  bytes: number
}

export interface Stage {
  /** Upload bytes to `path` (relative to the stage prefix). */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<StagedFile>
  /** Remove a staged file; best effort, missing is fine. */
  remove(path: string): Promise<void>
  /** Write the sink's probe object (proves the upload credentials). */
  test(): Promise<void>
  close(): Promise<void>
}

export interface StageLocation {
  type: 's3' | 'gcs' | 'azure'
  url: string
  region?: string
  /** S3-compatible endpoint (Iceberg only). */
  endpoint?: string
  forcePathStyle?: boolean
}

export interface StageDeps {
  hostGuard: HostGuard
  /** Test seam: use this sink instead of building one. */
  sink?: ObjectStoreSink
  /** Forwarded to the S3 sink (test seam). */
  s3?: Pick<S3SinkDeps, 'clientFactory' | 'putCommand' | 'deleteCommand'>
}

async function objectStoreFor(
  loc: StageLocation,
  parsed: ParsedStageUrl,
  secrets: StageSecretValues,
  deps: StageDeps,
): Promise<ObjectStoreSink> {
  if (deps.sink) return deps.sink
  switch (parsed.type) {
    case 's3':
      return createS3Sink(
        {
          bucket: parsed.bucket!,
          region: loc.region ?? 'us-east-1',
          prefix: parsed.prefix,
          endpoint: loc.endpoint,
          forcePathStyle: loc.forcePathStyle ?? false,
          compression: 'snappy',
        },
        {
          accessKeyId: secrets.stageAccessKeyId,
          secretAccessKey: secrets.stageSecretAccessKey,
          sessionToken: secrets.stageSessionToken,
        },
        { hostGuard: deps.hostGuard, ...deps.s3 },
      )
    case 'gcs':
      return createGcsSink(
        { bucket: parsed.bucket!, prefix: parsed.prefix, compression: 'snappy' },
        { credentialsJson: secrets.stageCredentialsJson },
        { hostGuard: deps.hostGuard },
      )
    case 'azure':
      if (!secrets.stageAccountKey && !secrets.stageSasToken) {
        throw new DestinationConfigError('An Azure stage needs stageAccountKey or stageSasToken.')
      }
      return createAzureBlobSink(
        {
          accountName: parsed.account!,
          container: parsed.container!,
          prefix: parsed.prefix,
          compression: 'snappy',
        },
        {
          accountKey: secrets.stageAccountKey,
          sasToken: secrets.stageSasToken?.replace(/^\?/, ''),
        },
        { hostGuard: deps.hostGuard },
      )
  }
}

/** Build the stage for a loader. `dialect` decides how file URLs are spelled. */
export async function createStage(
  loc: StageLocation,
  secrets: StageSecretValues,
  dialect: UrlDialect,
  deps: StageDeps,
): Promise<Stage & { baseUrl: string; parsed: ParsedStageUrl }> {
  let parsed: ParsedStageUrl
  try {
    parsed = parseStageUrl(loc.url)
  } catch (err) {
    throw new DestinationConfigError((err as Error).message, [
      { path: 'stage.url', message: (err as Error).message },
    ])
  }
  const sink = await objectStoreFor(loc, parsed, secrets, deps)
  const baseUrl = renderStageUrl(parsed, dialect)
  return {
    baseUrl,
    parsed,
    async upload(path, bytes, contentType) {
      await sink.writeFile(path, bytes, contentType)
      const slash = path.lastIndexOf('/')
      const dirUrl = `${baseUrl}${path.slice(0, slash + 1)}`
      const name = path.slice(slash + 1)
      return { path, dirUrl, name, url: `${dirUrl}${name}`, bytes: bytes.byteLength }
    },
    async remove(path) {
      await sink.deleteFile?.(path)
    },
    test: () => sink.test(),
    close: () => sink.close(),
  }
}

/** Whether the stage secrets hold inline credentials a warehouse could use. */
export function hasInlineStageCredentials(
  type: StageLocation['type'],
  secrets: StageSecretValues,
): boolean {
  if (type === 's3') return Boolean(secrets.stageAccessKeyId && secrets.stageSecretAccessKey)
  if (type === 'azure') return Boolean(secrets.stageSasToken)
  return false
}
