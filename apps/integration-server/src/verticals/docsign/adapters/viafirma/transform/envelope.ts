import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso, type RawViafirmaSet } from './shared'

/**
 * Map a Viafirma SET status to the canonical envelope status.
 *
 * Viafirma SET/message statuses:
 *   DRAFT / PENDING          → not yet dispatched
 *   RECEIVED                 → delivered to recipient, awaiting response
 *   WAITING_CHECK            → signed, pending back-office approval
 *   RESPONSED                → all recipients responded (completed)
 *   REJECTED                 → a recipient rejected
 *   EXPIRED                  → validity window elapsed
 *   ERROR                    → processing error
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'PENDING':
      return 'draft'
    case 'SENT':
      return 'sent'
    case 'RECEIVED':
    case 'OPENED':
      return 'delivered'
    case 'WAITING_CHECK':
    case 'RESPONSED':
    case 'SIGNED':
    case 'FINISHED':
      return 'completed'
    case 'REJECTED':
      return 'declined'
    case 'EXPIRED':
      return 'expired'
    case 'CANCELED':
    case 'CANCELLED':
    case 'ERROR':
      return 'voided'
    default:
      return 'draft'
  }
}

/**
 * Viafirma signs each recipient in `order` when provided. When more than one
 * distinct order exists the SET is signed sequentially; otherwise in parallel.
 */
function signingOrder(raw: RawViafirmaSet): 'parallel' | 'sequential' {
  const orders = (raw.links ?? [])
    .map((l) => l.order)
    .filter((o): o is number => typeof o === 'number')
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

function signerIds(raw: RawViafirmaSet): string[] {
  const links = [...(raw.links ?? [])]
  links.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return links
    .map((l) => l.messageCode ?? l.key)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

const COMPLETED = new Set(['RESPONSED', 'SIGNED', 'FINISHED'])
const DECLINED = new Set(['REJECTED'])

export function transformEnvelope(raw: RawViafirmaSet): Envelope {
  const status = (raw.status ?? '').toUpperCase()
  return {
    id: raw.code,
    externalId: raw.code,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? '',
    message: pickStr(raw.description),
    senderId: pickStr(raw.userCode),
    senderName: pickStr(raw.userName),
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: (raw.messages ?? [])
      .map((m) => m.code)
      .filter((c): c is string => typeof c === 'string' && c.length > 0),
    createdAt: toIso(raw.creationDate),
    completedAt: COMPLETED.has(status) ? toIso(raw.updateDate) : undefined,
    declinedAt: DECLINED.has(status) ? toIso(raw.updateDate) : undefined,
    expiresAt: toIso(raw.expirationDate),
    updatedAt: toIso(raw.updateDate),
    platform: 'viafirma',
    metadata: strMap({
      groupCode: raw.groupCode,
      groupTitle: raw.groupTitle,
      externalCode: raw.externalCode,
      externalStatus: raw.externalStatus,
      rawStatus: raw.status,
    }),
    raw,
  }
}
