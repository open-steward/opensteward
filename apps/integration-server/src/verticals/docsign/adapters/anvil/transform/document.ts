import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import { anvilFileId, type RawAnvilFile } from './envelope'

export type { RawAnvilFile } from './envelope'

/**
 * Anvil exposes documents through `etchPacket.documentGroup.files`. Each file
 * carries `eid`, a display `name`, a `filename`, and a `type`. Anvil does not
 * expose file size or page count on this manifest, and — per the docsign
 * firewall — never the file content. Missing fields stay `undefined`.
 */
export function transformDocument(
  raw: RawAnvilFile,
  envelopeId: string,
  order: number,
): Document {
  const externalId = anvilFileId(raw, order)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? pickStr(raw.filename) ?? pickStr(raw.title) ?? `document-${order}`,
    mimeType: raw.type === 'pdf' ? 'application/pdf' : pickStr(raw.type),
    order,
    platform: 'anvil',
    metadata: strMap({ filename: raw.filename, type: raw.type }),
    raw,
  }
}
