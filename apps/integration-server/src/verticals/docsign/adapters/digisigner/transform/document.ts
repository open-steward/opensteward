/**
 * DigiSigner signature request document → canonical Document (metadata only).
 *
 * Documented fields (https://www.digisigner.com/esignature-api/esignature-api-documentation/):
 *   "documents[] array Array of documents in this signature request
 *    ├ document_id string Document id"
 * and, from Send Signature Request, "The response parameters duplicate the
 * request parameters", which include "title (optional) string Title under
 * which the document will be sent to signers".
 *
 * Why title, order and role are read from Get Signature Request Status even
 * though its response table lists only document_id/email/is_signature_completed:
 *   - the API reference's Send Signature Request note, "The response parameters
 *     duplicate the request parameters", and its sample response is
 *     byte-identical to the Get Signature Request Status sample;
 *   - the official client (github.com/DigiSigner/digi-signer-csharp-client,
 *     DigiSignerClient.cs) deserializes GET /signature_requests/{id} into the
 *     same SignatureRequest type it sends ("<returns>SignatureRequest with
 *     filled IDs and signature request data.</returns>"), whose Document has
 *     [JsonProperty("title")] and whose Signer has [JsonProperty("order")]
 *     and [JsonProperty("role")].
 * All three are optional reads with no fallback value.
 *
 * The API returns no file name, size, page count or media type. `name` is the
 * echoed `title` when the request set one and empty otherwise.
 */
import type { Document } from '../../../schema/document'
import { redactSigner, type RawDigiSignerSigner } from './signer'

export interface RawDigiSignerDocument {
  document_id?: string
  title?: string
  subject?: string
  message?: string
  signers?: RawDigiSignerSigner[]
}

export function documentId(signatureRequestId: string, docId: string): string {
  return `${signatureRequestId}:${docId}`
}

export function requireDocumentId(raw: RawDigiSignerDocument, signatureRequestId: string): string {
  if (!raw.document_id) {
    throw new Error(`digisigner signature request ${signatureRequestId} lists a document without document_id`)
  }
  return raw.document_id
}

/** The document with every signer's signing link removed. */
export function redactDocument(raw: RawDigiSignerDocument): RawDigiSignerDocument {
  return raw.signers ? { ...raw, signers: raw.signers.map(redactSigner) } : { ...raw }
}

export function transformDocument(
  raw: RawDigiSignerDocument,
  signatureRequestId: string,
  order: number,
): Document {
  const docId = requireDocumentId(raw, signatureRequestId)
  return {
    id: documentId(signatureRequestId, docId),
    externalId: docId,
    envelopeId: signatureRequestId,
    name: raw.title ?? '',
    order,
    platform: 'digisigner',
    metadata: {},
    raw: redactDocument(raw),
  }
}
