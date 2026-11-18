/**
 * DigiSigner signature request → canonical Envelope.
 *
 * Documented response (https://www.digisigner.com/esignature-api/esignature-api-documentation/,
 * "Get Signature Request Status", GET /v1/signature_requests/{signature_request_id}):
 *   "signature_request_id string Signature request id
 *    is_completed boolean If all signers completed all documents
 *    documents[] array Array of documents in this signature request"
 * plus the sample's top-level send_emails, embedded, use_text_tags and
 * hide_text_tags booleans.
 *
 * A signature request exists only once "Send Signature Request ... Initiates
 * the signature process", so an incomplete one is `sent`. The API reports no
 * decline, cancel or expiry state and no timestamps. The status stays `sent`
 * even when send_emails is false (whose signers map to `created`): the request
 * was still issued, and the canonical envelope enum has no "issued but not
 * emailed" state; `draft` would claim it was never sent.
 *
 * signingOrder: the schema allows only parallel | sequential. It is
 * `sequential` only when signers carry more than one distinct echoed `order`
 * (see transform/signer.ts for why `order` is read); a request with no order,
 * or one shared order, has nothing to sequence and is `parallel`.
 */
import type { Envelope } from '../../../schema/envelope'
import {
  documentId,
  redactDocument,
  requireDocumentId,
  type RawDigiSignerDocument,
} from './document'
import { signerId } from './signer'

export interface RawDigiSignerSignatureRequest {
  signature_request_id?: string
  send_emails?: boolean
  embedded?: boolean
  use_text_tags?: boolean
  hide_text_tags?: boolean
  is_completed?: boolean
  documents?: RawDigiSignerDocument[]
}

export function requireSignatureRequestId(raw: RawDigiSignerSignatureRequest): string {
  if (!raw.signature_request_id) {
    throw new Error('digisigner signature request response has no signature_request_id')
  }
  return raw.signature_request_id
}

/** Documented "send_emails ... (default: true)". */
export function sendsEmails(raw: RawDigiSignerSignatureRequest): boolean {
  return raw.send_emails !== false
}

export function transformEnvelope(raw: RawDigiSignerSignatureRequest): Envelope {
  const id = requireSignatureRequestId(raw)
  const documents = raw.documents ?? []
  const signerIds: string[] = []
  const orders = new Set<number>()
  for (const doc of documents) {
    const docId = requireDocumentId(doc, id)
    for (const s of doc.signers ?? []) {
      if (!s.email) throw new Error(`digisigner signature request ${id} lists a signer without email`)
      signerIds.push(signerId(id, docId, s.email))
      if (typeof s.order === 'number') orders.add(s.order)
    }
  }
  const metadata: Record<string, string> = {}
  for (const key of ['send_emails', 'embedded', 'use_text_tags', 'hide_text_tags'] as const) {
    if (typeof raw[key] === 'boolean') metadata[key] = String(raw[key])
  }
  return {
    id,
    externalId: id,
    status: raw.is_completed === true ? 'completed' : 'sent',
    subject: '',
    signingOrder: orders.size > 1 ? 'sequential' : 'parallel',
    signerIds,
    documentIds: documents.map((d) => documentId(id, requireDocumentId(d, id))),
    platform: 'digisigner',
    metadata,
    raw: { ...raw, documents: documents.map(redactDocument) },
  }
}
