import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

/**
 * One entry of the `signatures[]` array returned by
 * `POST /v1/checkSignStatus/` ("Get Document status" in eSignly's API
 * reference, https://www.esignly.com/api-docs.html, which renders the
 * collection https://www.esignly.com/eSignlyDec16-postmanCollection.json).
 *
 * Documented success example (verbatim):
 *   "signatures": [ { "signature_id": "142692",
 *     "signer_email_address": "example@example.com", "user_key": "707319997",
 *     "signer_name": "", "status_code": "SENT", "date": null,
 *     "system_details": null } ]
 *
 * Only these fields are read. `date` and `system_details` are null in the
 * only example and their meaning is not described, so they are not mapped.
 */
export interface RawEsignlySignature {
  signature_id?: string
  signer_email_address?: string
  user_key?: string
  signer_name?: string
  status_code?: string
  date?: string | null
  system_details?: unknown
  [key: string]: unknown
}

/**
 * `status_code` values. The only code any first-party eSignly doc shows is
 * "SENT" (every signatures[] example in eSignlyDec16-postmanCollection.json).
 * The endpoint's prose mentions "(sent, viewed, signed)" but never gives the
 * wire codes for the latter two, so they are not guessed: anything other than
 * "SENT" is surfaced as `unknown`, and the raw code stays in
 * `metadata.statusCode`.
 */
function mapStatus(s: string | undefined): SignerStatus {
  return s === 'SENT' ? 'sent' : 'unknown'
}

export function transformSigner(raw: RawEsignlySignature, envelopeId: string): Signer {
  const externalId = pickStr(raw.signature_id)
  if (!externalId) {
    throw new Error(
      `eSignly checkSignStatus returned a signature without signature_id on ${envelopeId}`,
    )
  }
  const email = pickStr(raw.signer_email_address)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    ...(email ? { email } : {}),
    name: pickStr(raw.signer_name) ?? '',
    // Every entry of `signatures[]` is a signature slot owned by a signer.
    role: 'signer',
    status: mapStatus(raw.status_code),
    platform: 'esignly',
    metadata: strMap({ userKey: raw.user_key, statusCode: raw.status_code }),
    raw,
  }
}
