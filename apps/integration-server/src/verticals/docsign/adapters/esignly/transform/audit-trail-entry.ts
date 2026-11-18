import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * eSignly audit-trail event. eSignly exposes court-admissible audit trails:
 * a flat history of events, each carrying an action, a timestamp, the actor,
 * and the originating IP address. Field names are snake_case on the wire.
 */
export interface RawEsignlyAuditEvent {
  event_id?: string
  event?: string
  action?: string
  description?: string
  timestamp?: string
  created_at?: string
  occurred_at?: string
  actor_id?: string
  user_id?: string
  actor_email?: string
  user_email?: string
  signer_email?: string
  actor_name?: string
  user_name?: string
  signer_name?: string
  ip_address?: string
  ip?: string
  [key: string]: unknown
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('create')) return 'created'
  if (a.includes('complete')) return 'completed'
  if (a.includes('sent') || a.includes('send')) return 'sent'
  if (a.includes('view') || a.includes('open')) return 'viewed'
  if (a.includes('sign')) return 'signed'
  if (a.includes('decline') || a.includes('reject')) return 'declined'
  if (a.includes('cancel') || a.includes('void')) return 'voided'
  if (a.includes('expire')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('authent')) return 'authenticated'
  if (a.includes('reassign')) return 'reassigned'
  if (a.includes('correct')) return 'corrected'
  if (a.includes('fail') || a.includes('bounce')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawEsignlyAuditEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const action = pickStr(raw.action) ?? pickStr(raw.event)
  const occurredAt =
    toIso(raw.timestamp ?? raw.occurred_at ?? raw.created_at) ?? new Date(0).toISOString()
  return {
    id: `${envelopeId}:${index}`,
    externalId: pickStr(raw.event_id) ?? `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapEventType(action),
    description: pickStr(raw.description) ?? action ?? '',
    actorId: pickStr(raw.actor_id) ?? pickStr(raw.user_id),
    actorEmail: pickStr(raw.actor_email) ?? pickStr(raw.user_email) ?? pickStr(raw.signer_email),
    actorName: pickStr(raw.actor_name) ?? pickStr(raw.user_name) ?? pickStr(raw.signer_name),
    actorIp: pickStr(raw.ip_address) ?? pickStr(raw.ip),
    platform: 'esignly',
    metadata: strMap({ action, event: raw.event }),
    raw,
  }
}
