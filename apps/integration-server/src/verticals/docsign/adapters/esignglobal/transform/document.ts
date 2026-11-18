import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import { documentExternalId, type RawEsignglobalFile } from './envelope'

/**
 * eSignGlobal references documents on the envelope detail by an opaque
 * `fileKey` (and sometimes `fileName`). There is a separate Download File
 * endpoint that returns the bytes — the adapter NEVER calls it. Only the
 * filename + fileKey are surfaced here; the canonical Document schema has no
 * content/url field, which is the firewall.
 */
export function transformDocument(
  raw: RawEsignglobalFile,
  envelopeId: string,
  order: number,
  kind: 'signFile' | 'attachment' = 'signFile',
): Document {
  const fileKey = String(raw.fileKey ?? `${order}`)
  const id = documentExternalId(envelopeId, fileKey)
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.fileName) ?? `document-${order}`,
    order,
    platform: 'esignglobal',
    metadata: strMap({ fileKey, kind }),
    raw,
  }
}
