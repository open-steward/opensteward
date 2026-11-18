import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawFptEcontractRecipient } from './signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * A FPT.eContract *contract* (hợp đồng) IS the envelope — it bundles one or
 * more documents and the set of recipients who sign them. The `status`
 * field follows the platform's contract lifecycle; recipients and document
 * references are returned inline on the contract detail payload.
 */
export interface RawFptEcontractContract {
  id: string | number
  code?: string
  title?: string
  name?: string
  status?: string
  description?: string
  note?: string
  creatorId?: string | number
  creatorEmail?: string
  creatorName?: string
  ownerEmail?: string
  ownerName?: string
  signType?: string
  signMode?: string
  templateId?: string | number
  recipients?: RawFptEcontractRecipient[]
  signers?: RawFptEcontractRecipient[]
  documents?: Array<{ id?: string | number; documentId?: string | number }>
  createdAt?: string
  createdDate?: string
  sentAt?: string
  sentDate?: string
  deliveredAt?: string
  signedAt?: string
  completedAt?: string
  completedDate?: string
  rejectedAt?: string
  declinedAt?: string
  cancelledAt?: string
  voidedAt?: string
  rejectReason?: string
  cancelReason?: string
  expiredAt?: string
  expireDate?: string
  updatedAt?: string
  modifiedDate?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  if (s === 'draft' || s === 'new' || s === 'created') return 'draft'
  if (
    s === 'sent' ||
    s === 'processing' ||
    s === 'pending' ||
    s === 'pending_sign' ||
    s === 'waiting_sign'
  )
    return 'sent'
  if (s === 'delivered' || s === 'viewed' || s === 'opened') return 'delivered'
  if (s === 'completed' || s === 'signed' || s === 'finished' || s === 'done') return 'completed'
  if (s === 'rejected' || s === 'declined' || s === 'denied') return 'declined'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided' || s === 'revoked' || s === 'deleted')
    return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function recipientList(raw: RawFptEcontractContract): RawFptEcontractRecipient[] {
  return raw.recipients ?? raw.signers ?? []
}

function envelopeSignerIds(raw: RawFptEcontractContract): string[] {
  return recipientList(raw)
    .map((r) => ({
      id: pickStr(r.recipientId ?? r.id),
      order: Number(r.signOrder ?? r.order ?? 0),
    }))
    .filter((r): r is { id: string; order: number } => r.id !== undefined)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id)
}

function signingOrder(raw: RawFptEcontractContract): 'parallel' | 'sequential' {
  const orders = recipientList(raw).map((r) => Number(r.signOrder ?? r.order ?? 0))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

function documentIds(raw: RawFptEcontractContract): string[] {
  return (raw.documents ?? [])
    .map((d) => pickStr(d.id ?? d.documentId))
    .filter((d): d is string => d !== undefined)
}

export function transformEnvelope(raw: RawFptEcontractContract): Envelope {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title ?? raw.name ?? raw.code) ?? '',
    message: pickStr(raw.description ?? raw.note),
    senderId: pickStr(raw.creatorId),
    senderEmail: pickStr(raw.creatorEmail ?? raw.ownerEmail),
    senderName: pickStr(raw.creatorName ?? raw.ownerName),
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: documentIds(raw),
    templateId: pickStr(raw.templateId),
    createdAt: toIso(raw.createdAt ?? raw.createdDate),
    sentAt: toIso(raw.sentAt ?? raw.sentDate),
    deliveredAt: toIso(raw.deliveredAt),
    completedAt: toIso(raw.completedAt ?? raw.completedDate ?? raw.signedAt),
    declinedAt: toIso(raw.rejectedAt ?? raw.declinedAt),
    voidedAt: toIso(raw.cancelledAt ?? raw.voidedAt),
    expiresAt: toIso(raw.expiredAt ?? raw.expireDate),
    updatedAt: toIso(raw.updatedAt ?? raw.modifiedDate),
    platform: 'fpt-econtract',
    metadata: strMap({
      code: raw.code,
      signType: raw.signType,
      signMode: raw.signMode,
      rejectReason: raw.rejectReason,
      cancelReason: raw.cancelReason,
    }),
    raw,
  }
}
