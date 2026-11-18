/**
 * DigiSigner invited signer → canonical Signer.
 *
 * Documented fields only (https://www.digisigner.com/esignature-api/esignature-api-documentation/,
 * "Get Signature Request Status"):
 *   "├ email string Signer email address
 *    ├ is_signature_completed boolean If particular signer completed particular document
 *    └ sign_document_url string URL of the DigiSigner signing page"
 *
 * DigiSigner invites a signer per document, so one canonical Signer is one
 * (document, email) pair. The API has no signer id; the id is composed from
 * the signature request id, the document id and the email so getSigner can
 * read it back. The API returns no signer name; the email address is the only
 * identity it gives, and is used as the display name.
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
 * `sign_document_url` is a live signing link and never leaves this transform.
 */
import type { Signer, SignerStatus } from '../../../schema/signer'

export interface RawDigiSignerSigner {
  email?: string
  is_signature_completed?: boolean
  sign_document_url?: string
  /** Request parameter "order (optional) integer Signing order", echoed in the response. */
  order?: number
  /** Request parameter "role (optional) string Signer role", echoed in the response. */
  role?: string
}

/** The signer without its signing link. */
export function redactSigner(raw: RawDigiSignerSigner): Omit<RawDigiSignerSigner, 'sign_document_url'> {
  const { sign_document_url: _link, ...rest } = raw
  return rest
}

export function signerId(signatureRequestId: string, documentId: string, email: string): string {
  return `${signatureRequestId}:${documentId}:${email}`
}

/**
 * `sendEmails` is the request's documented "send_emails ... If invitation and
 * notification emails are sent (default: true)". An unsigned signer on a
 * request that sends no email was never invited by DigiSigner.
 */
function mapStatus(raw: RawDigiSignerSigner, sendEmails: boolean): SignerStatus {
  if (raw.is_signature_completed === true) return 'signed'
  return sendEmails ? 'sent' : 'created'
}

export function transformSigner(
  raw: RawDigiSignerSigner,
  signatureRequestId: string,
  documentId: string,
  sendEmails: boolean,
): Signer {
  if (!raw.email) {
    throw new Error(
      `digisigner signature request ${signatureRequestId} document ${documentId} lists a signer without email`,
    )
  }
  const metadata: Record<string, string> = { documentId }
  if (typeof raw.order === 'number') metadata['order'] = String(raw.order)
  if (raw.role) metadata['role'] = raw.role
  return {
    id: signerId(signatureRequestId, documentId, raw.email),
    externalId: `${documentId}:${raw.email}`,
    envelopeId: signatureRequestId,
    email: raw.email,
    name: raw.email,
    role: 'signer',
    status: mapStatus(raw, sendEmails),
    platform: 'digisigner',
    metadata,
    raw: redactSigner(raw),
  }
}
