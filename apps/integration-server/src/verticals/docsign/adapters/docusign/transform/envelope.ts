import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawDocuSignEnvelope {
  envelopeId: string
  status: string
  emailSubject?: string
  emailBlurb?: string
  sender?: { userId?: string; email?: string; userName?: string; accountId?: string }
  signingLocation?: string
  recipientsCount?: string
  templateId?: string
  createdDateTime?: string
  sentDateTime?: string
  deliveredDateTime?: string
  completedDateTime?: string
  declinedDateTime?: string
  voidedDateTime?: string
  voidedReason?: string
  expireDateTime?: string
  statusChangedDateTime?: string
  lastModifiedDateTime?: string
  envelopeUri?: string
  // recipients block carries signer ids when expanded
  recipients?: {
    signers?: Array<{ recipientId: string; routingOrder?: string }>
    carbonCopies?: Array<{ recipientId: string }>
    inPersonSigners?: Array<{ recipientId: string }>
    witnesses?: Array<{ recipientId: string }>
  }
  envelopeDocuments?: Array<{ documentId: string }>
  customFields?: { textCustomFields?: Array<{ name: string; value: string }> }
  [key: string]: unknown
}

function mapStatus(raw: string): EnvelopeStatus {
  const s = raw.toLowerCase()
  if (s === 'created' || s === 'draft') return 'draft'
  if (s === 'sent') return 'sent'
  if (s === 'delivered') return 'delivered'
  if (s === 'completed' || s === 'signed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'voided') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function envelopeSignerIds(raw: RawDocuSignEnvelope): string[] {
  const r = raw.recipients
  if (!r) return []
  const all: Array<{ id: string; order: number }> = []
  for (const s of r.signers ?? [])
    all.push({ id: s.recipientId, order: Number(s.routingOrder ?? '0') })
  for (const s of r.inPersonSigners ?? [])
    all.push({ id: s.recipientId, order: Number((s as { routingOrder?: string }).routingOrder ?? '0') })
  for (const s of r.witnesses ?? [])
    all.push({ id: s.recipientId, order: Number((s as { routingOrder?: string }).routingOrder ?? '0') })
  for (const s of r.carbonCopies ?? []) all.push({ id: s.recipientId, order: 0 })
  return all.sort((a, b) => a.order - b.order).map((s) => s.id)
}

function signingOrder(raw: RawDocuSignEnvelope): 'parallel' | 'sequential' {
  const orders = (raw.recipients?.signers ?? []).map((s) => Number(s.routingOrder ?? '0'))
  if (orders.length === 0) return 'parallel'
  const uniq = new Set(orders)
  return uniq.size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawDocuSignEnvelope): Envelope {
  return {
    id: raw.envelopeId,
    externalId: raw.envelopeId,
    status: mapStatus(raw.status),
    subject: raw.emailSubject ?? '',
    message: pickStr(raw.emailBlurb),
    senderId: pickStr(raw.sender?.userId),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.userName),
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: (raw.envelopeDocuments ?? []).map((d) => d.documentId),
    templateId: pickStr(raw.templateId),
    createdAt: toIso(raw.createdDateTime),
    sentAt: toIso(raw.sentDateTime),
    deliveredAt: toIso(raw.deliveredDateTime),
    completedAt: toIso(raw.completedDateTime),
    declinedAt: toIso(raw.declinedDateTime),
    voidedAt: toIso(raw.voidedDateTime),
    expiresAt: toIso(raw.expireDateTime),
    updatedAt: toIso(raw.lastModifiedDateTime ?? raw.statusChangedDateTime),
    platform: 'docusign',
    metadata: {
      ...strMap(
        Object.fromEntries(
          (raw.customFields?.textCustomFields ?? []).map((f) => [f.name, f.value]),
        ),
      ),
      ...(raw.voidedReason ? { voidedReason: raw.voidedReason } : {}),
    },
    raw,
  }
}
