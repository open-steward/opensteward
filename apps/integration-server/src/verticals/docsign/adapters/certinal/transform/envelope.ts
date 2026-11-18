import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Certinal Transaction — the `data` object returned by GetTransactionDetails.
 * Maps to the canonical Envelope. Participants are the signers, documents are
 * the attached files; both nest inside the transaction.
 */
export interface RawCertinalCandidate {
  id?: string
  name?: string
  emailAddress?: string
  language?: string
  type?: string
  action?: string
  actionDate?: string
  createdDate?: string
  [key: string]: unknown
}

export interface RawCertinalParticipant {
  id: string
  status?: string
  lastUpdatedDate?: string
  createdDate?: string
  sequence?: number
  role?: string
  candidates?: RawCertinalCandidate[]
  enableDelegate?: boolean
  autoProcess?: boolean
  [key: string]: unknown
}

export interface RawCertinalDocument {
  id: string
  sequence?: number
  fileName?: string
  pageCount?: number
  deletable?: boolean
  private?: boolean
  [key: string]: unknown
}

export interface RawCertinalTransaction {
  transactionId: string
  name?: string
  status?: string
  mail?: { message?: string }
  createdBy?: { id?: string; username?: string; emailAddress?: string }
  createdDate?: string
  lastUpdatedDate?: string
  sentDate?: string
  expiryAndReminders?: {
    expiresAtTimestamp?: string
    expiryDays?: number
    reminderFrequency?: number
  }
  participants?: RawCertinalParticipant[]
  documents?: RawCertinalDocument[]
  customFields?: Array<{ customFieldId?: string; value?: string; fieldName?: string; fieldType?: string }>
  externalId?: string
  separateAgreements?: boolean
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toUpperCase()
  if (s === 'DRAFT' || s === 'CREATED') return 'draft'
  if (s === 'SENT' || s === 'IN_PROGRESS' || s === 'INPROGRESS' || s === 'PENDING') return 'sent'
  if (s === 'VIEWED' || s === 'DELIVERED') return 'delivered'
  if (s === 'COMPLETED' || s === 'SIGNED' || s === 'EXECUTED') return 'completed'
  if (s === 'DECLINED' || s === 'REJECTED') return 'declined'
  if (s === 'VOIDED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'WITHDRAWN') return 'voided'
  if (s === 'EXPIRED') return 'expired'
  return 'draft'
}

function completedDate(raw: RawCertinalTransaction): string | undefined {
  if (mapStatus(raw.status) !== 'completed') return undefined
  return toIso(raw.lastUpdatedDate)
}

function declinedDate(raw: RawCertinalTransaction): string | undefined {
  if (mapStatus(raw.status) !== 'declined') return undefined
  return toIso(raw.lastUpdatedDate)
}

function voidedDate(raw: RawCertinalTransaction): string | undefined {
  if (mapStatus(raw.status) !== 'voided') return undefined
  return toIso(raw.lastUpdatedDate)
}

function signingOrder(raw: RawCertinalTransaction): 'parallel' | 'sequential' {
  const seqs = (raw.participants ?? []).map((p) => Number(p.sequence ?? 0))
  return new Set(seqs).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawCertinalTransaction): Envelope {
  const participants = [...(raw.participants ?? [])].sort(
    (a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
  )
  return {
    id: raw.transactionId,
    externalId: pickStr(raw.externalId) ?? raw.transactionId,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.mail?.message),
    senderId: pickStr(raw.createdBy?.id),
    senderEmail: pickStr(raw.createdBy?.emailAddress),
    senderName: pickStr(raw.createdBy?.username),
    signingOrder: signingOrder(raw),
    signerIds: participants.map((p) => p.id),
    documentIds: (raw.documents ?? []).map((d) => d.id),
    createdAt: toIso(raw.createdDate),
    sentAt: toIso(raw.sentDate),
    completedAt: completedDate(raw),
    declinedAt: declinedDate(raw),
    voidedAt: voidedDate(raw),
    expiresAt: toIso(raw.expiryAndReminders?.expiresAtTimestamp),
    updatedAt: toIso(raw.lastUpdatedDate),
    platform: 'certinal',
    metadata: {
      ...strMap(
        Object.fromEntries(
          (raw.customFields ?? [])
            .filter((f) => f.fieldName != null && f.value != null)
            .map((f) => [String(f.fieldName), String(f.value)]),
        ),
      ),
      ...strMap({ rawStatus: raw.status, separateAgreements: raw.separateAgreements }),
    },
    raw,
  }
}
