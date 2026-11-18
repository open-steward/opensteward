import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * inSign document — an entry in a session's `documents[]` (from
 * `/get/documents/full`) or `documentData[]` (from `/get/status`). inSign
 * exposes only metadata here; the binary lives behind separate download
 * endpoints the adapter never calls. `docname` is a colon-joined
 * "<file>:<display>" string, so we prefer the clean `displayname`.
 */
export interface RawInsignDocument {
  docid?: string
  displayname?: string
  docname?: string
  numberofpages?: number
  mustbesigned?: boolean
  hasbeensigned?: boolean
  hasbeensignedCompletely?: boolean
  numberOfSignaturesNeeded?: number
  docposition?: number
  docchecksum?: string
  // signatureBitmap / annotations carry biometric markers — never reflected.
  [key: string]: unknown
}

export function transformDocument(
  raw: RawInsignDocument,
  sessionId: string,
  order: number,
): Document {
  const id = pickStr(raw.docid) ?? `${sessionId}:doc:${order}`
  const name =
    pickStr(raw.displayname) ??
    pickStr(raw.docname)?.split(':')[0] ??
    `document-${order}`
  return {
    id,
    externalId: id,
    envelopeId: sessionId,
    name,
    pageCount: pickNum(raw.numberofpages),
    mimeType: 'application/pdf',
    order: typeof raw.docposition === 'number' ? raw.docposition : order,
    platform: 'insign',
    metadata: strMap({
      checksum: raw.docchecksum,
      mustBeSigned: raw.mustbesigned,
      hasBeenSigned: raw.hasbeensigned,
      hasBeenSignedCompletely: raw.hasbeensignedCompletely,
      signaturesNeeded: raw.numberOfSignaturesNeeded,
    }),
    raw,
  }
}
