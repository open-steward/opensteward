import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawESignatureEuRequest } from './envelope'

/**
 * e-Signature.eu attaches exactly one PDF per signature request, named by the
 * request's `doc_name`. There is no documents collection and no size/page
 * metadata on the wire — and the signed bytes (`pdf_file_base64`) are never
 * surfaced. We synthesise a single canonical Document per request so the
 * documents surface is non-empty.
 */
export function transformDocument(raw: RawESignatureEuRequest, envelopeId: string): Document {
  const id = `${envelopeId}:doc`
  const base = pickStr(raw.doc_name) ?? `document-${envelopeId}`
  const name = /\.pdf$/i.test(base) ? base : `${base}.pdf`
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'e-signature-eu',
    metadata: strMap({}),
    raw: { doc_name: raw.doc_name },
  }
}
