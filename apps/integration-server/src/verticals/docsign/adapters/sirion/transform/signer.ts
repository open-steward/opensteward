import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * SirionOne signatory — a person assigned to sign a contract. Signatories
 * carry an email, a display name, a signing order, a per-signatory status,
 * and (when SirionOne routes externally) a party type distinguishing the
 * owning org from the counterparty.
 */
export interface RawSirionSignatory {
  signatoryId?: string
  emailId?: string
  email?: string
  name?: string
  displayName?: string
  signingOrder?: number
  status?: string
  role?: string
  partyType?: string
  sentOn?: string
  deliveredOn?: string
  viewedOn?: string
  signedOn?: string
  declinedOn?: string
  declineReason?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SIGNED':
    case 'COMPLETED':
      return 'signed'
    case 'DECLINED':
    case 'REJECTED':
      return 'declined'
    case 'VIEWED':
    case 'DELIVERED':
      return 'delivered'
    case 'SENT':
    case 'OUT_FOR_SIGNATURE':
      return 'sent'
    case 'AUTO_RESPONDED':
      return 'auto_responded'
    default:
      return 'created'
  }
}

function mapRole(s: string | undefined): SignerRole {
  switch ((s ?? '').toUpperCase()) {
    case 'CC':
    case 'CARBON_COPY':
      return 'cc'
    case 'WITNESS':
      return 'witness'
    case 'APPROVER':
      return 'approver'
    case 'EDITOR':
      return 'editor'
    default:
      return 'signer'
  }
}

export function transformSigner(raw: RawSirionSignatory, envelopeId: string): Signer {
  const id = raw.signatoryId ?? raw.emailId ?? raw.email ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.emailId) ?? pickStr(raw.email) ?? '',
    name: pickStr(raw.displayName) ?? pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    status: mapStatus(raw.status),
    routingOrder: typeof raw.signingOrder === 'number' && raw.signingOrder > 0 ? raw.signingOrder : undefined,
    sentAt: toIso(raw.sentOn),
    deliveredAt: toIso(raw.deliveredOn) ?? toIso(raw.viewedOn),
    signedAt: toIso(raw.signedOn),
    declinedAt: toIso(raw.declinedOn),
    declineReason: pickStr(raw.declineReason),
    platform: 'sirion',
    metadata: strMap({ partyType: raw.partyType }),
    raw,
  }
}
