import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Shape of an audit-trail history event returned by
 * GET /api/v2/envelopes/{envelopeId}/history.
 *
 * jSign uses snake_case field names.
 */
export interface RawJsignHistoryEvent {
  id?: string
  event_type?: string
  action?: string
  description?: string
  occurred_at?: string
  created_at?: string
  timestamp?: string
  user_id?: string
  user_email?: string
  user_name?: string
  ip_address?: string
  user_agent?: string
  [key: string]: unknown
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('created')) return 'created'
  if (a.includes('sent')) return 'sent'
  if (a.includes('viewed') || a.includes('opened')) return 'viewed'
  if (a.includes('signed') || a.includes('completed')) return 'signed'
  if (a.includes('declined')) return 'declined'
  if (a.includes('voided') || a.includes('cancelled') || a.includes('canceled')) return 'voided'
  if (a.includes('expired')) return 'expired'
  if (a.includes('reminder')) return 'auto_reminded'
  if (a.includes('authent')) return 'authenticated'
  if (a.includes('reassigned')) return 'reassigned'
  if (a.includes('correct')) return 'corrected'
  if (a.includes('failure') || a.includes('failed')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawJsignHistoryEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt =
    toIso(raw.occurred_at ?? raw.created_at ?? raw.timestamp) ??
    new Date(0).toISOString()
  const action = raw.event_type ?? raw.action ?? ''
  return {
    id: pickStr(raw.id) ?? `${envelopeId}:${index}`,
    externalId: pickStr(raw.id) ?? `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapEventType(action),
    description: pickStr(raw.description) ?? action,
    actorId: pickStr(raw.user_id),
    actorEmail: pickStr(raw.user_email),
    actorName: pickStr(raw.user_name),
    actorIp: pickStr(raw.ip_address),
    platform: 'jsign',
    metadata: strMap({ user_agent: raw.user_agent }),
    raw,
  }
}
