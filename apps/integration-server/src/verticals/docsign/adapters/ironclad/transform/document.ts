import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * A document entry from a workflow's `documents` endpoint. Metadata only:
 * the canonical Document deliberately omits the `download` href so signed
 * contract content can never leak through this surface.
 */
export interface RawIroncladDocument {
  key?: string
  filename?: string
  version?: string
  versionNumber?: number
  download?: string
  lastModified?: {
    timestamp?: string
    author?: { displayName?: string; email?: string }
  }
  [key: string]: unknown
}

export function transformDocument(
  raw: RawIroncladDocument,
  envelopeId: string,
  order: number,
  inSignaturePacket: boolean,
): Document {
  const externalId = raw.key ?? `${envelopeId}:${order}`
  return {
    id: externalId,
    externalId,
    envelopeId,
    name: pickStr(raw.filename) ?? `document-${order}`,
    mimeType: 'application/pdf',
    order,
    platform: 'ironclad',
    metadata: strMap({
      version: raw.version,
      versionNumber: pickNum(raw.versionNumber),
      inSignaturePacket,
      lastModifiedAt: raw.lastModified?.timestamp,
      lastModifiedBy: raw.lastModified?.author?.email,
    }),
    raw,
  }
}
