import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawSecuredSigningDocument } from './envelope'

/**
 * Secured Signing models a signing request and its file as one `Document`
 * object, so the canonical Document is derived from the same payload as the
 * Envelope. Only metadata is exposed — `DocumentUrl` is a download link and
 * is deliberately NOT mapped to any canonical field (the schema has no
 * content/url surface; signed-document content is refused at the wire level).
 */
export function transformDocument(
  raw: RawSecuredSigningDocument,
  envelopeId: string,
): Document {
  const reference = pickStr(raw.Reference) ?? envelopeId
  return {
    id: reference,
    externalId: reference,
    envelopeId,
    name: pickStr(raw.Name) ?? '',
    // Uploads are restricted to .pdf/.doc/.docx/.odt/.rtf/.xls/.xlsx/.ods;
    // the served, signed artifact is always a PDF.
    mimeType: 'application/pdf',
    order: 0,
    platform: 'secured-signing',
    metadata: strMap({
      packageReference: raw.PackageReference,
      clientReference: raw.ClientReference,
      hasFileUploaded: raw.HasFileUploaded,
    }),
    raw,
  }
}
