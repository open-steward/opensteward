import type { Document } from '../../../schema/document'
import { strMap } from './shared'
import type { RawDigioSigningParty } from './signer'

/**
 * Digio's "Get Document Details" reply — `ExternalDocDetails` in
 * https://documentation.digio.in/swagger/get_getDocumentObject.json.
 * Only the documented keys are read.
 */
export interface RawDigioDocumentDetails {
  /** "Unique ID to identify documents provided by Digio." */
  id: string
  /** enum ["inbound","outbound"] */
  agreement_type?: string
  /** enum ["draft","requested","completed","expired","failed"] */
  agreement_status?: string
  /** "Name of the file as provided by you" */
  file_name?: string
  /** "Number of pages in document" */
  no_of_pages?: number
  /** "Array of signing parties" */
  signing_parties?: RawDigioSigningParty[]
  [key: string]: unknown
}

/**
 * Digio holds one file per document, and the document IS the envelope, so
 * the document id serves as both. Filename + page count only: content, signed
 * PDFs and Aadhaar eSign payloads are never fetched.
 */
export function transformDocument(raw: RawDigioDocumentDetails): Document {
  if (typeof raw.id !== 'string' || !raw.id) {
    throw new Error('Digio document details carry no id')
  }
  if (typeof raw.file_name !== 'string' || !raw.file_name) {
    throw new Error(`Digio document ${raw.id} has no file_name`)
  }
  const pages = raw.no_of_pages
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: raw.file_name,
    ...(typeof pages === 'number' && Number.isInteger(pages) && pages >= 0
      ? { pageCount: pages }
      : {}),
    order: 0,
    platform: 'digio',
    metadata: strMap({
      agreementType: raw.agreement_type,
      agreementStatus: raw.agreement_status,
    }),
    raw,
  }
}
