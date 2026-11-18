import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIsoDatetime } from './shared'
import type { RawLegaldeskSigner, RawLegaldeskTransaction } from './envelope'

/**
 * A signer on a LegalDesk eSign transaction. LegalDesk's gateway nests
 * signers under the transaction; there is no signer-by-id endpoint, so the
 * adapter lists signers off the parent transaction and the canonical
 * `externalId` is the gateway `signer_id` (falling back to a positional id).
 *
 * Per-signer auth detail (Aadhaar OTP / biometric / iris mode) is surfaced
 * as `metadata.auth_mode` only — never the eKYC / OTP payload itself.
 */
export interface RawLegaldeskSignerDetail extends RawLegaldeskSigner {
  status?: string
  auth_mode?: string
  sent_at?: string | number
  delivered_at?: string | number
  viewed_at?: string | number
  signed_at?: string | number
  esigned_at?: string | number
  declined_at?: string | number
  rejected_at?: string | number
  decline_reason?: string
  rejection_reason?: string
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed' || lower === 'esigned' || lower === 'success')
    return 'signed'
  if (lower === 'declined' || lower === 'rejected') return 'declined'
  if (lower === 'delivered' || lower === 'viewed' || lower === 'opened') return 'delivered'
  if (lower === 'sent' || lower === 'notified' || lower === 'pending') return 'sent'
  if (lower === 'auto_responded' || lower === 'expired') return 'auto_responded'
  return 'created'
}

export function transformSigner(
  raw: RawLegaldeskSignerDetail,
  transaction: RawLegaldeskTransaction,
  index: number,
): Signer {
  const txnId =
    pickStr(transaction.transaction_id) ??
    pickStr(transaction.txn_id) ??
    pickStr(transaction.reference_id) ??
    ''
  const externalId = pickStr(raw.signer_id) ?? pickStr(raw.reference_id) ?? `${txnId}:${index}`
  const orderRaw = raw.sign_order ?? raw.signing_order
  const order = typeof orderRaw === 'string' ? Number(orderRaw) : orderRaw
  return {
    id: `${txnId}:${externalId}`,
    externalId,
    envelopeId: txnId,
    email: pickStr(raw.signer_email) ?? pickStr(raw.email) ?? '',
    name: pickStr(raw.signer_name) ?? pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder:
      typeof order === 'number' && !Number.isNaN(order) && order > 0 ? order : undefined,
    sentAt: toIsoDatetime(raw.sent_at),
    deliveredAt: toIsoDatetime(raw.delivered_at ?? raw.viewed_at),
    signedAt: toIsoDatetime(raw.signed_at ?? raw.esigned_at),
    declinedAt: toIsoDatetime(raw.declined_at ?? raw.rejected_at),
    declineReason: pickStr(raw.decline_reason) ?? pickStr(raw.rejection_reason),
    platform: 'legaldesk',
    metadata: strMap({ auth_mode: raw.auth_mode }),
    raw,
  }
}
