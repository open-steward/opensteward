import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * OneSpan Sign "package" — the envelope analogue. `roles[]` carries the
 * signer steps; each role has a `signers[]` list (almost always one entry,
 * sometimes multiple for in-person signing).
 */
export interface RawOneSpanSigner {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  type?: string
  language?: string
  signed?: boolean
  signedDate?: string
  delivered?: boolean
  deliveredDate?: string
  declined?: boolean
  declinedDate?: string
  declinedReason?: string
  signingOrder?: number | string
  [key: string]: unknown
}

export interface RawOneSpanRole {
  id?: string
  name?: string
  type?: string
  index?: number | string
  signers?: RawOneSpanSigner[]
  [key: string]: unknown
}

export interface RawOneSpanDocumentEntry {
  id?: string
  name?: string
  description?: string
  size?: number | string
  pages?: Array<unknown>
  index?: number | string
  [key: string]: unknown
}

export interface RawOneSpanPackage {
  id?: string
  name?: string
  description?: string
  status?: string
  type?: string
  language?: string
  trashed?: boolean
  visibility?: string
  emailMessage?: string
  due?: string
  expiresAt?: string
  created?: string
  updated?: string
  sent?: string
  completed?: string
  notarized?: boolean
  inOrder?: boolean
  sender?: { id?: string; email?: string; firstName?: string; lastName?: string }
  roles?: RawOneSpanRole[]
  documents?: RawOneSpanDocumentEntry[]
  template?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toUpperCase()
  if (s === 'SENT') return 'sent'
  if (s === 'COMPLETED' || s === 'ARCHIVED') return 'completed'
  if (s === 'DECLINED' || s === 'OPTED_OUT') return 'declined'
  if (s === 'EXPIRED') return 'expired'
  if (s === 'INACTIVE' || s === 'TRASHED' || s === 'CANCELLED') return 'voided'
  if (s === 'DRAFT') return 'draft'
  return 'draft'
}

function envelopeSignerIds(raw: RawOneSpanPackage): string[] {
  const out: Array<{ id: string; order: number }> = []
  for (const role of raw.roles ?? []) {
    const order = Number(role.index ?? 0)
    for (const signer of role.signers ?? []) {
      if (signer.id) out.push({ id: signer.id, order })
    }
  }
  return out.sort((a, b) => a.order - b.order).map((x) => x.id)
}

function signingOrder(raw: RawOneSpanPackage): 'parallel' | 'sequential' {
  if (raw.inOrder === true) return 'sequential'
  const orders = (raw.roles ?? []).map((r) => Number(r.index ?? 0))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawOneSpanPackage): Envelope {
  const id = pickStr(raw.id) ?? ''
  const senderName = [pickStr(raw.sender?.firstName), pickStr(raw.sender?.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim()
  const status = mapStatus(raw.status)
  return {
    id,
    externalId: id,
    status,
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.description) ?? pickStr(raw.emailMessage),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: senderName || undefined,
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.id))
      .filter((s): s is string => !!s),
    templateId: pickStr(raw.template),
    createdAt: toIso(raw.created),
    sentAt: toIso(raw.sent),
    completedAt: toIso(raw.completed),
    expiresAt: toIso(raw.expiresAt ?? raw.due),
    updatedAt: toIso(raw.updated),
    platform: 'onespan-sign',
    metadata: strMap({
      type: raw.type,
      language: raw.language,
      visibility: raw.visibility,
    }),
    raw,
  }
}
