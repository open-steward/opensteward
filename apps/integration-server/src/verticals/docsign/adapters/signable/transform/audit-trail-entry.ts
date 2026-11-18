import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Signable exposes a per-envelope audit trail as `envelope_history` on the
 * envelope-detail endpoint. Each event is a free-text `history_detail` plus
 * the IP, user-agent and timestamp it occurred at — there is no structured
 * event-type or actor id, so the canonical eventType is classified from the
 * detail text.
 */
export interface RawSignableHistoryEvent {
  history_detail?: string
  history_ip?: string
  history_user_agent?: string
  history_date?: string
  [key: string]: unknown
}

/** Classify the free-text history detail into a canonical event type. */
function mapEventType(detail: string | undefined): AuditTrailEventType {
  const d = (detail ?? '').toLowerCase()
  if (d.includes('cancel')) return 'voided'
  if (d.includes('expire')) return 'expired'
  if (d.includes('reject') || d.includes('declin')) return 'declined'
  if (d.includes('complete')) return 'completed'
  if (d.includes('sign')) return 'signed'
  if (d.includes('open') || d.includes('view')) return 'viewed'
  if (d.includes('remind')) return 'auto_reminded'
  if (d.includes('sent') || d.includes('send')) return 'sent'
  if (d.includes('creat')) return 'created'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawSignableHistoryEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIso(raw.history_date) ?? new Date(0).toISOString(),
    eventType: mapEventType(raw.history_detail),
    description: pickStr(raw.history_detail) ?? '',
    actorIp: pickStr(raw.history_ip),
    platform: 'signable',
    metadata: strMap({
      userAgent: raw.history_user_agent,
    }),
    raw,
  }
}
