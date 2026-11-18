import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * SirionOne contract. A contract is the agreement object that, in canonical
 * docsign terms, maps onto an envelope: it carries a title, a lifecycle
 * status, the owning party (sender) plus the counterparty, an ordered list
 * of signatories, attached documents, an originating template, and the key
 * execution dates.
 */
export interface RawSirionContract {
  contractId: string
  title?: string
  name?: string
  status?: string
  description?: string
  note?: string
  owner?: { userId?: string; emailId?: string; email?: string; name?: string; displayName?: string }
  counterParty?: { partyId?: string; name?: string }
  signatories?: RawSirionSignatory[]
  documents?: Array<{ documentId?: string; fileName?: string; name?: string }>
  signingOrderEnabled?: boolean
  contractTemplateId?: string
  templateId?: string
  createdOn?: string
  sentOn?: string
  effectiveDate?: string
  executedOn?: string
  completedOn?: string
  expiryDate?: string
  lastModifiedOn?: string
  [key: string]: unknown
}

interface RawSirionSignatory {
  signatoryId?: string
  emailId?: string
  email?: string
  signingOrder?: number
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'AUTHORING':
    case 'CREATED':
      return 'draft'
    case 'OUT_FOR_SIGNATURE':
    case 'PENDING_SIGNATURE':
    case 'SENT':
      return 'sent'
    case 'PARTIALLY_SIGNED':
    case 'DELIVERED':
      return 'delivered'
    case 'EXECUTED':
    case 'SIGNED':
    case 'COMPLETED':
    case 'ACTIVE':
      return 'completed'
    case 'DECLINED':
    case 'REJECTED':
      return 'declined'
    case 'CANCELLED':
    case 'TERMINATED':
    case 'VOIDED':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawSirionContract): Envelope {
  const signatories = raw.signatories ?? []
  const orders = signatories.map((s) => s.signingOrder ?? 0)
  const sequential = raw.signingOrderEnabled === true || new Set(orders).size > 1
  return {
    id: raw.contractId,
    externalId: raw.contractId,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? pickStr(raw.name) ?? '',
    message: pickStr(raw.description) ?? pickStr(raw.note),
    senderId: pickStr(raw.owner?.userId),
    senderEmail: pickStr(raw.owner?.emailId) ?? pickStr(raw.owner?.email),
    senderName: pickStr(raw.owner?.displayName) ?? pickStr(raw.owner?.name),
    signingOrder: sequential ? 'sequential' : 'parallel',
    signerIds: signatories
      .map((s) => s.signatoryId ?? s.emailId ?? s.email ?? '')
      .filter((s): s is string => Boolean(s)),
    documentIds: (raw.documents ?? [])
      .map((d) => d.documentId ?? '')
      .filter((s): s is string => Boolean(s)),
    templateId: pickStr(raw.contractTemplateId) ?? pickStr(raw.templateId),
    createdAt: toIso(raw.createdOn),
    sentAt: toIso(raw.sentOn),
    completedAt: toIso(raw.executedOn) ?? toIso(raw.completedOn),
    expiresAt: toIso(raw.expiryDate),
    updatedAt: toIso(raw.lastModifiedOn),
    platform: 'sirion',
    metadata: strMap({
      counterParty: raw.counterParty?.name,
      effectiveDate: raw.effectiveDate,
    }),
    raw,
  }
}
