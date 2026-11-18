import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * actaSIGN audit-trail event → canonical AuditTrailEntry.
 *
 * Every signing process carries an automatic audit trail (compliance
 * evidence). Each entry has a typed event, an ISO timestamp, a human-readable
 * description, and — for signer-scoped events — the actor's identity and IP.
 */
export interface RawActasignAuditEvent {
  id?: string
  type?: string
  event?: string
  description?: string
  occurred_at?: string
  timestamp?: string
  actor_id?: string
  actor_email?: string
  actor_name?: string
  ip_address?: string
  [key: string]: unknown
}

function mapEventType(type: string | undefined): AuditTrailEventType {
  const a = (type ?? '').toLowerCase()
  if (a.includes('created')) return 'created'
  if (a.includes('sent') || a.includes('invited')) return 'sent'
  if (a.includes('viewed') || a.includes('opened')) return 'viewed'
  if (a.includes('signed')) return 'signed'
  if (a.includes('completed')) return 'completed'
  if (a.includes('rejected') || a.includes('declined')) return 'declined'
  if (a.includes('cancelled') || a.includes('canceled') || a.includes('voided')) return 'voided'
  if (a.includes('expired')) return 'expired'
  if (a.includes('reminder') || a.includes('reminded')) return 'auto_reminded'
  if (a.includes('authent')) return 'authenticated'
  if (a.includes('fail')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawActasignAuditEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const type = raw.type ?? raw.event
  return {
    id: raw.id ?? `${envelopeId}:${index}`,
    externalId: raw.id ?? `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIso(raw.occurred_at ?? raw.timestamp) ?? new Date(0).toISOString(),
    eventType: mapEventType(type),
    description: pickStr(raw.description) ?? pickStr(type) ?? '',
    actorId: pickStr(raw.actor_id),
    actorEmail: pickStr(raw.actor_email),
    actorName: pickStr(raw.actor_name),
    actorIp: pickStr(raw.ip_address),
    platform: 'actasign',
    metadata: strMap({ type }),
    raw,
  }
}
