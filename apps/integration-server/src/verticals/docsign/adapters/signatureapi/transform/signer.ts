import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * SignatureAPI recipient (embedded in the envelope payload). Recipient types
 * are signer, approver, preparer, and automatic_signer; SignatureAPI has no
 * separate carbon-copy recipient kind.
 *
 * Docs: https://signatureapi.com/docs/api/resources/recipients/signer
 */
export interface RawSignatureapiRecipient {
  id: string
  type?: string
  key?: string
  name?: string
  email?: string
  status?: string
  order?: number
  sent_at?: string
  viewed_at?: string
  completed_at?: string
  rejected_at?: string
  reject_reason?: string
  decline_reason?: string
  [key: string]: unknown
}

function mapRole(type: string | undefined): SignerRole {
  switch ((type ?? '').toLowerCase()) {
    case 'signer':
    case 'automatic_signer':
      return 'signer'
    case 'approver':
      return 'approver'
    case 'preparer':
      return 'editor'
    default:
      return 'signer'
  }
}

/**
 * Recipient status: pending | awaiting | sent | completed | rejected |
 * soft_bounced | hard_bounced | failed | replaced.
 */
function mapStatus(status: string | undefined): SignerStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
      return 'signed'
    case 'rejected':
      return 'declined'
    case 'sent':
      return 'sent'
    case 'pending':
    case 'awaiting':
      return 'created'
    case 'soft_bounced':
    case 'hard_bounced':
    case 'failed':
      return 'auto_responded'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawSignatureapiRecipient,
  envelopeId: string,
): Signer {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.type),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.order),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    signedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.rejected_at),
    declineReason: pickStr(raw.reject_reason ?? raw.decline_reason),
    platform: 'signatureapi',
    metadata: strMap({ type: raw.type, key: raw.key, status: raw.status }),
    raw,
  }
}
