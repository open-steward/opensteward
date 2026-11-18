import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawDocuSignSigner {
  recipientId: string
  recipientIdGuid?: string
  routingOrder?: string
  email?: string
  name?: string
  status?: string
  signedDateTime?: string
  declinedDateTime?: string
  declinedReason?: string
  deliveredDateTime?: string
  sentDateTime?: string
  recipientType?: string
  customFields?: string[]
  [key: string]: unknown
}

function mapRole(typeKey: string): SignerRole {
  switch (typeKey) {
    case 'signers':
      return 'signer'
    case 'carbonCopies':
      return 'cc'
    case 'inPersonSigners':
      return 'in_person_signer'
    case 'witnesses':
      return 'witness'
    case 'editors':
      return 'editor'
    case 'certifiedDeliveries':
      return 'cc'
    case 'agents':
      return 'editor'
    case 'intermediaries':
      return 'approver'
    default:
      return 'signer'
  }
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'completed' || lower === 'signed') return 'signed'
  if (lower === 'declined') return 'declined'
  if (lower === 'delivered' || lower === 'viewed') return 'delivered'
  if (lower === 'sent') return 'sent'
  if (lower === 'autoresponded') return 'auto_responded'
  return 'created'
}

export function transformSigner(
  raw: RawDocuSignSigner,
  envelopeId: string,
  typeKey: string,
): Signer {
  return {
    id: raw.recipientIdGuid ?? `${envelopeId}:${raw.recipientId}`,
    externalId: raw.recipientId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(typeKey),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.routingOrder),
    sentAt: toIso(raw.sentDateTime),
    deliveredAt: toIso(raw.deliveredDateTime),
    signedAt: toIso(raw.signedDateTime),
    declinedAt: toIso(raw.declinedDateTime),
    declineReason: pickStr(raw.declinedReason),
    platform: 'docusign',
    metadata: strMap({ recipientType: raw.recipientType }),
    raw,
  }
}
