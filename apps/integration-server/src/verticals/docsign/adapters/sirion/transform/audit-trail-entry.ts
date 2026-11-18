import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * SirionOne contract activity-history entry. SirionOne records contract
 * lifecycle events (created, sent for signature, viewed, signed/executed,
 * declined, terminated, …) with the acting user and a timestamp; this is the
 * compliance audit trail for an agreement.
 */
export interface RawSirionActivity {
  activityType?: string
  action?: string
  eventName?: string
  performedOn?: string
  timestamp?: string
  performedBy?: { userId?: string; emailId?: string; email?: string; name?: string; displayName?: string }
  ipAddress?: string
  description?: string
  comment?: string
  [key: string]: unknown
}

function mapEvent(s: string | undefined): AuditTrailEventType {
  const t = (s ?? '').toLowerCase()
  if (t.includes('create') || t.includes('author')) return 'created'
  if (t.includes('terminate') || t.includes('cancel') || t.includes('void')) return 'voided'
  if (t.includes('execute') || t.includes('complete')) return 'completed'
  if (t.includes('sign')) return 'signed'
  if (t.includes('send') || t.includes('sent') || t.includes('out_for')) return 'sent'
  if (t.includes('view') || t.includes('open')) return 'viewed'
  if (t.includes('decline') || t.includes('reject')) return 'declined'
  if (t.includes('expire')) return 'expired'
  if (t.includes('remind')) return 'auto_reminded'
  if (t.includes('amend') || t.includes('correct') || t.includes('modif')) return 'corrected'
  if (t.includes('auth')) return 'authenticated'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawSirionActivity,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const eventName = raw.activityType ?? raw.action ?? raw.eventName
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIso(raw.performedOn) ?? toIso(raw.timestamp) ?? new Date(0).toISOString(),
    eventType: mapEvent(eventName),
    description: pickStr(raw.description) ?? pickStr(raw.comment) ?? pickStr(eventName) ?? '',
    actorId: pickStr(raw.performedBy?.userId),
    actorEmail: pickStr(raw.performedBy?.emailId) ?? pickStr(raw.performedBy?.email),
    actorName: pickStr(raw.performedBy?.displayName) ?? pickStr(raw.performedBy?.name),
    actorIp: pickStr(raw.ipAddress),
    platform: 'sirion',
    metadata: strMap({ activityType: eventName }),
    raw,
  }
}
