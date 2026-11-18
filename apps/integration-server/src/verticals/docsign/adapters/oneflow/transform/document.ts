import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawOneflowContract } from './envelope'

/**
 * Oneflow renders the contract to PDF; the canonical Document is one
 * entry per envelope (no body content).
 */
export function transformDocument(raw: RawOneflowContract): Document {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    envelopeId: id,
    name: pickStr(raw.name) ?? '',
    mimeType: 'application/pdf',
    order: 0,
    platform: 'oneflow',
    metadata: strMap({}),
    raw,
  }
}
