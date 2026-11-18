import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * A signer on a signature step of a Webdox CLM decision workflow, as returned
 * by "Get all signers from a decision workflow step"
 * (GET /api/v2/decision_workflows/<WF_ID>/steps/<STEP_NUMBER>/signers?parallel_number=<P>,
 * https://doc.webdoxclm.com/docs/v2/en/index.html). Only the fields in that
 * documented example are declared.
 */
export interface RawWebdoxSigner {
  id: string
  step_number?: number | null
  step_parallel_number?: number | null
  kind?: string | null
  status?: string | null
  user_id?: string | null
  country_code?: string | null
  name?: string | null
  email?: string | null
  national_identification_number?: string | null
  national_identification_kind_id?: string | null
  signature_id?: string | null
  envelope_id?: number | string | null
  signed_at?: string | null
  signed_difference?: unknown
  phone_number?: string | null
  has_valid_positioned_signatures?: boolean | null
  cc_email?: string | null
  use_notification_method_whatsapp?: boolean | null
}

/**
 * A set `signed_at` is a signature. The docs show one other status value,
 * "pending", and do not define it: they do not say whether the signer has
 * been notified (a signer on a step the workflow has not reached may not have
 * been), so it is not mapped to 'sent' or 'created'. Anything short of a
 * signature is 'unknown', and the upstream value is kept in metadata.status.
 */
function mapStatus(raw: RawWebdoxSigner): SignerStatus {
  if (toIso(raw.signed_at)) return 'signed'
  return 'unknown'
}

export function transformSigner(raw: RawWebdoxSigner, envelopeId: string): Signer {
  const email = pickStr(raw.email)
  const name = pickStr(raw.name)
  // `name` is in the documented example and required canonically. There is no
  // documented substitute, so a signer without one is an error, never ''.
  if (!name) throw new Error(`Webdox signer ${String(raw.id)} has no name`)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    envelopeId,
    ...(email ? { email } : {}),
    name,
    // Documented kinds are "internal" and "external"; both sign.
    role: 'signer',
    status: mapStatus(raw),
    // step_number is the workflow step index, which counts non-signature
    // steps too. It is not a signer routing order, so it goes to metadata.
    signedAt: toIso(raw.signed_at),
    platform: 'webdox',
    metadata: strMap({
      status: raw.status,
      stepNumber: raw.step_number,
      kind: raw.kind,
      userId: raw.user_id,
      countryCode: raw.country_code,
      ccEmail: raw.cc_email,
      phoneNumber: raw.phone_number,
      nationalIdentificationNumber: raw.national_identification_number,
      nationalIdentificationKindId: raw.national_identification_kind_id,
      signatureId: raw.signature_id,
      stepParallelNumber: raw.step_parallel_number,
    }),
    raw,
  }
}
