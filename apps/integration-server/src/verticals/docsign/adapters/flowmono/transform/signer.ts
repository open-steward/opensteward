/**
 * Transform a raw Flowmono recipient entry into the canonical Signer shape.
 *
 * Flowmono recipients are returned from
 * GET /api/ExternalApplication/getsigningrequestrecipientsbyreferencenumber/{referenceNumber}
 * and /api/ExternalApplication/getdocumentrecipientsbyclientreference/{clientReference}.
 *
 * The raw recipient object merges both signing-request-level controls
 * (SigningRequestControlsVm) and standalone recipient records.
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Raw Flowmono recipient as returned inside Result.entity from the
 * getsigningrequestrecipients* endpoints. Field names inferred from
 * swagger definitions (SigningRequestControlsVm + RecipientActionLog).
 */
export interface RawFlowmonoRecipient {
  /** Numeric identifier for this recipient record. */
  id?: number | string
  recipientEmail?: string
  recipientName?: string
  /** Routing/signing order rank (lower = earlier). */
  rank?: number | string
  /** Recipient action status: "Pending", "Completed", "Declined", etc. */
  status?: string
  /** ISO 8601 action timestamps. */
  actionDate?: string
  sentDate?: string
  declinedDate?: string
  declinedReason?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'completed' || lower === 'signed') return 'signed'
  if (lower === 'declined') return 'declined'
  if (lower === 'viewed') return 'delivered'
  if (lower === 'pending' || lower === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawFlowmonoRecipient,
  envelopeId: string,
): Signer {
  const email = pickStr(raw.recipientEmail) ?? ''
  const idStr = pickStr(raw.id) ?? email
  return {
    id: idStr ? `${envelopeId}:${idStr}` : envelopeId,
    externalId: idStr,
    envelopeId,
    email,
    name: pickStr(raw.recipientName) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.rank),
    sentAt: toIso(raw.sentDate),
    deliveredAt: undefined,
    signedAt: toIso(raw.actionDate),
    declinedAt: toIso(raw.declinedDate),
    declineReason: pickStr(raw.declinedReason),
    platform: 'flowmono',
    metadata: strMap({ rank: raw.rank }),
    raw,
  }
}
