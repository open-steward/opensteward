import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Webdox CLM activity record returned by GET /api/v2/audit.
 * The v2 API returns a flat list; the exact field set is not fully documented,
 * so we accept a generous unknown-keyed shape and gracefully downgrade missing
 * optionals.
 */
export interface RawWebdoxAuditEntry {
  id?: number | string
  action?: string
  event?: string
  description?: string
  created_at?: string
  occurred_at?: string
  user_id?: number | string
  user_email?: string
  user_name?: string
  ip?: string
  ip_address?: string
  trackable_id?: number | string
  trackable_type?: string
  [key: string]: unknown
}

function mapAction(raw: RawWebdoxAuditEntry): AuditTrailEventType {
  const t = (pickStr(raw.action) ?? pickStr(raw.event) ?? '').toLowerCase()
  if (t.includes('creat') || t.includes('initiat')) return 'created'
  if (t.includes('sent') || t.includes('send')) return 'sent'
  if (t.includes('view') || t.includes('open')) return 'viewed'
  if (t.includes('sign') || t.includes('complet') || t.includes('finish')) return 'signed'
  if (t.includes('declin') || t.includes('reject')) return 'declined'
  if (t.includes('void') || t.includes('cancel')) return 'voided'
  if (t.includes('expir')) return 'expired'
  if (t.includes('remind')) return 'auto_reminded'
  if (t.includes('auth')) return 'authenticated'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawWebdoxAuditEntry,
  index: number,
): AuditTrailEntry {
  const externalId = raw.id != null ? String(raw.id) : String(index)
  const occurredAt =
    toIso(raw.created_at) ?? toIso(raw.occurred_at) ?? new Date(0).toISOString()
  const description =
    pickStr(raw.description) ??
    pickStr(raw.action) ??
    pickStr(raw.event) ??
    'activity'

  return {
    id: externalId,
    externalId,
    // Webdox GET /audit is a global list — no per-envelope scope in the path;
    // trackable_id/trackable_type carry the associated record when present.
    envelopeId: pickStr(raw.trackable_id) ?? '',
    occurredAt,
    eventType: mapAction(raw),
    description,
    actorId: raw.user_id != null ? String(raw.user_id) : undefined,
    actorEmail: pickStr(raw.user_email),
    actorName: pickStr(raw.user_name),
    actorIp: pickStr(raw.ip) ?? pickStr(raw.ip_address),
    platform: 'webdox',
    metadata: strMap({
      trackableId: raw.trackable_id,
      trackableType: raw.trackable_type,
      action: raw.action,
      event: raw.event,
    }),
    raw,
  }
}
