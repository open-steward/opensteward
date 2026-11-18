/**
 * Google Cloud Storage sink. `@google-cloud/storage` is loaded on first use.
 * Without a service-account key, Application Default Credentials apply
 * (workload identity, GOOGLE_APPLICATION_CREDENTIALS, the metadata server).
 */
import type { GcsConfig, GcsSecrets, HostGuard, ObjectStoreSink } from '../types'
import { normalizePrefix } from '../types'
import { connectionTestPath } from './common'

export interface GcsSinkDeps {
  hostGuard: HostGuard
}

export async function createGcsSink(
  config: GcsConfig,
  secrets: GcsSecrets,
  deps: GcsSinkDeps,
): Promise<ObjectStoreSink> {
  if (config.apiEndpoint) await deps.hostGuard(new URL(config.apiEndpoint).hostname)
  const { Storage } = await import('@google-cloud/storage')
  const storage = new Storage({
    ...(config.projectId ? { projectId: config.projectId } : {}),
    ...(config.apiEndpoint ? { apiEndpoint: config.apiEndpoint } : {}),
    ...(secrets.credentialsJson
      ? { credentials: JSON.parse(secrets.credentialsJson) as Record<string, string> }
      : {}),
  })
  const bucket = storage.bucket(config.bucket)
  const prefix = normalizePrefix(config.prefix)

  async function writeFile(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await bucket.file(`${prefix}${path}`).save(Buffer.from(bytes), {
      contentType,
      resumable: false,
    })
  }

  return {
    kind: 'object_store',
    writeFile,
    async deleteFile(path: string) {
      await bucket.file(`${prefix}${path}`).delete({ ignoreNotFound: true })
    },
    async test() {
      await writeFile(
        connectionTestPath(),
        new TextEncoder().encode(JSON.stringify({ ok: true, at: new Date().toISOString() })),
        'application/json',
      )
    },
    async close() {
      /* the client holds no sockets between requests */
    },
  }
}
