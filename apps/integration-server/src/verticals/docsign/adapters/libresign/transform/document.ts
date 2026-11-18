import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawLibreSignFile } from './envelope'

/**
 * LibreSign has no separate "documents" collection — each file under signature
 * is a single PDF, so the canonical Document is derived from the same
 * `ValidatedFile` shape as the envelope. Metadata only: no content, no URL is
 * surfaced (the schema forbids it; `file`/`url` stay out of the canonical
 * object and live only on `raw`).
 */
export function transformDocument(raw: RawLibreSignFile, envelopeId: string): Document {
  return {
    id: envelopeId,
    externalId: envelopeId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.totalPages),
    mimeType: pickStr(raw.mime) ?? 'application/pdf',
    order: 0,
    platform: 'libresign',
    metadata: strMap({
      nodeId: raw.nodeId,
      pdfVersion: raw.pdfVersion,
    }),
    raw,
  }
}
