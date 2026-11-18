/**
 * Azure Blob Storage sink. `@azure/storage-blob` is loaded on first use.
 * Authenticates with the storage account key or a container SAS token.
 */
import type { AzureBlobConfig, AzureBlobSecrets, HostGuard, ObjectStoreSink } from '../types'
import { DestinationConfigError, normalizePrefix } from '../types'
import { connectionTestPath } from './common'

export interface AzureSinkDeps {
  hostGuard: HostGuard
}

export async function createAzureBlobSink(
  config: AzureBlobConfig,
  secrets: AzureBlobSecrets,
  deps: AzureSinkDeps,
): Promise<ObjectStoreSink> {
  if (config.endpoint) await deps.hostGuard(new URL(config.endpoint).hostname)
  const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob')
  const url = (config.endpoint ?? `https://${config.accountName}.blob.core.windows.net`).replace(
    /\/+$/,
    '',
  )
  let service: InstanceType<typeof BlobServiceClient>
  if (secrets.accountKey) {
    service = new BlobServiceClient(
      url,
      new StorageSharedKeyCredential(config.accountName, secrets.accountKey),
    )
  } else if (secrets.sasToken) {
    service = new BlobServiceClient(`${url}?${secrets.sasToken.replace(/^\?/, '')}`)
  } else {
    throw new DestinationConfigError('Azure Blob needs an accountKey or a sasToken.')
  }
  const container = service.getContainerClient(config.container)
  const prefix = normalizePrefix(config.prefix)

  async function writeFile(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await container.getBlockBlobClient(`${prefix}${path}`).uploadData(Buffer.from(bytes), {
      blobHTTPHeaders: { blobContentType: contentType },
    })
  }

  return {
    kind: 'object_store',
    writeFile,
    async deleteFile(path: string) {
      await container.getBlockBlobClient(`${prefix}${path}`).deleteIfExists()
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
