import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * A FPT.eContract contract-history row. The platform records each lifecycle
 * transition (create / send / view / sign / reject / cancel / complete) with
 * an action code, a timestamp, and the acting user.
 */
export interface RawFptEcontractHistoryEvent {
  id?: string | number
  action?: string
  event?: string
  type?: string
  description?: string
  message?: string
  note?: string
  createdAt?: string
  createdDate?: string
  time?: string
  timestamp?: string | number
  actorId?: string | number
  userId?: string | number
  actorEmail?: string
  userEmail?: string
  actorName?: string
  userName?: string
  ipAddress?: string
  ip?: string
  [key: string]: unknown
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('create')) return 'created'
  if (a.includes('send') || a.includes('sent')) return 'sent'
  if (a.includes('view') || a.includes('open')) return 'viewed'
  if (a.includes('sign')) return 'signed'
  if (a.includes('reject') || a.includes('declin') || a.includes('deny')) return 'declined'
  if (a.includes('cancel') || a.includes('void') || a.includes('revoke')) return 'voided'
  if (a.includes('complet') || a.includes('finish') || a.includes('done')) return 'completed'
  if (a.includes('expire')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('auth')) return 'authenticated'
  if (a.includes('fail')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawFptEcontractHistoryEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const action = pickStr(raw.action ?? raw.event ?? raw.type)
  const occurredAt =
    toIso(raw.createdAt ?? raw.createdDate ?? raw.time ?? raw.timestamp) ??
    new Date(0).toISOString()
  return {
    id: `${envelopeId}:${index}`,
    externalId: pickStr(raw.id) ?? `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapEventType(action),
    description: pickStr(raw.description ?? raw.message ?? raw.note) ?? action ?? '',
    actorId: pickStr(raw.actorId ?? raw.userId),
    actorEmail: pickStr(raw.actorEmail ?? raw.userEmail),
    actorName: pickStr(raw.actorName ?? raw.userName),
    actorIp: pickStr(raw.ipAddress ?? raw.ip),
    platform: 'fpt-econtract',
    metadata: strMap({ action }),
    raw,
  }
}
