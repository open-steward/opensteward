import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Assently exposes no event-log resource on the read API — lifecycle events are
 * only delivered as callbacks. The adapter therefore synthesises audit-trail
 * entries from the case + party timestamps available on `GET /api/cases/{id}`:
 * case created/sent/finished, and a `signed` row per party `signedOn`.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt?: string
  type: AuditTrailEventType
  description: string
  actorId?: string
  actorEmail?: string
  actorName?: string
  actorIp?: string
}

export function transformAuditTrailEntry(
  event: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(event.occurredAt) ?? new Date(0).toISOString()
  return {
    id: `${event.envelopeId}:${index}`,
    externalId: `${event.envelopeId}:${event.type}:${index}`,
    envelopeId: event.envelopeId,
    occurredAt,
    eventType: event.type,
    description: event.description,
    actorId: pickStr(event.actorId),
    actorEmail: pickStr(event.actorEmail),
    actorName: pickStr(event.actorName),
    actorIp: pickStr(event.actorIp),
    platform: 'assently',
    metadata: strMap({ type: event.type }),
    raw: event,
  }
}
