import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Signority history entry, nested under `document.histories`. Each row is a
 * free-text audit action plus the acting party + timestamp.
 */
export interface RawSignorityHistory {
  id?: number | string
  documentID?: number | string
  action?: string
  actionId?: number | string
  dateTime?: number | string
  name?: string
  email?: string
  ip?: string
  [key: string]: unknown
}

/**
 * Signority history actions are human-readable strings ("Document created by",
 * "Document signed by", …); classify by keyword into the canonical event type.
 */
function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('created')) return 'created'
  if (a.includes('sent') || a.includes('invited')) return 'sent'
  if (a.includes('viewed') || a.includes('opened')) return 'viewed'
  if (a.includes('signed') || a.includes('completed')) return 'signed'
  if (a.includes('declined') || a.includes('rejected')) return 'declined'
  if (a.includes('voided') || a.includes('cancel')) return 'voided'
  if (a.includes('expired')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('authent')) return 'authenticated'
  if (a.includes('reassign')) return 'reassigned'
  if (a.includes('fail') || a.includes('bounce')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawSignorityHistory,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const externalId = pickStr(raw.id) ?? `${envelopeId}:${index}`
  return {
    id: `${envelopeId}:${index}`,
    externalId,
    envelopeId,
    occurredAt: toIso(raw.dateTime) ?? new Date(0).toISOString(),
    eventType: mapEventType(raw.action),
    description: pickStr(raw.action) ?? '',
    actorName: pickStr(raw.name),
    actorEmail: pickStr(raw.email),
    actorIp: pickStr(raw.ip),
    platform: 'signority',
    metadata: strMap({ actionId: raw.actionId }),
    raw,
  }
}
