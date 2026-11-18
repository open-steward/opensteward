import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawPenneoCasefile {
  id: number | string
  title?: string
  status?: number | string
  metaData?: string
  created?: string
  sent?: string
  completed?: string
  expireAt?: string
  signOnMeeting?: boolean
  documents?: number[]
  signers?: number[]
  sender?: { id?: number; email?: string; name?: string }
  caseFileTypeId?: number
  [key: string]: unknown
}

function mapStatus(s: number | string | undefined): EnvelopeStatus {
  // Penneo casefile status codes: 0=draft, 1=new/sent, 2=sent (in-progress), 3=completed, 4=declined, 5=voided, 6=expired
  const n = typeof s === 'number' ? s : Number(s)
  if (Number.isNaN(n)) {
    const str = String(s ?? '').toLowerCase()
    if (str.includes('complete')) return 'completed'
    if (str.includes('sign')) return 'sent'
    if (str.includes('decline')) return 'declined'
    if (str.includes('void') || str.includes('cancel')) return 'voided'
    if (str.includes('expire')) return 'expired'
    return 'draft'
  }
  switch (n) {
    case 0:
      return 'draft'
    case 1:
    case 2:
      return 'sent'
    case 3:
      return 'completed'
    case 4:
      return 'declined'
    case 5:
      return 'voided'
    case 6:
      return 'expired'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawPenneoCasefile): Envelope {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? '',
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: 'parallel',
    signerIds: (raw.signers ?? []).map(String),
    documentIds: (raw.documents ?? []).map(String),
    createdAt: toIso(raw.created),
    sentAt: toIso(raw.sent),
    completedAt: toIso(raw.completed),
    expiresAt: toIso(raw.expireAt),
    platform: 'penneo',
    metadata: strMap({
      caseFileTypeId: raw.caseFileTypeId,
      metaData: raw.metaData,
    }),
    raw,
  }
}
