import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawOpensignDocument } from './envelope'

/**
 * OpenSign attaches a single PDF to each `contracts_Document`. There is no
 * per-file list endpoint, so the canonical Document is synthesised from the
 * parent document object. Content is REFUSED — the `URL` / `SignedUrl` /
 * `CertificateUrl` fields are never surfaced as a body, only the page count
 * (when OpenSign reports it) and filename.
 */
export function transformDocument(raw: RawOpensignDocument): Document {
  const pageCount =
    pickNum((raw as Record<string, unknown>)['DocumentPdf']) ??
    pickNum((raw as Record<string, unknown>)['Pages']) ??
    undefined
  return {
    id: raw.objectId,
    externalId: raw.objectId,
    envelopeId: raw.objectId,
    name: pickStr(raw.Name) ?? '',
    pageCount,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'opensign',
    metadata: strMap({
      isSignyourself: raw.IsSignyourself,
      hasCertificate: raw.CertificateUrl ? true : undefined,
    }),
    raw,
  }
}
