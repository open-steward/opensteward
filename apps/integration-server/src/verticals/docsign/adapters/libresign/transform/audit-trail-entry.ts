import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap } from './shared'

/**
 * LibreSign exposes no dedicated audit-trail endpoint, so we synthesise the
 * trail from the file lifecycle + per-signer timestamps on the
 * `file/validate` response. Each event carries an already-ISO `occurredAt`.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt: string
  type: AuditTrailEventType
  description: string
  actorId?: string
  actorEmail?: string
  actorName?: string
  actorIp?: string
  /** Extra context folded into metadata. */
  extra?: Record<string, unknown>
}

export function transformAuditTrailEntry(
  event: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${event.envelopeId}:${index}`,
    externalId: `${event.envelopeId}:${index}`,
    envelopeId: event.envelopeId,
    occurredAt: event.occurredAt,
    eventType: event.type,
    description: event.description,
    actorId: pickStr(event.actorId),
    actorEmail: pickStr(event.actorEmail),
    actorName: pickStr(event.actorName),
    actorIp: pickStr(event.actorIp),
    platform: 'libresign',
    metadata: strMap(event.extra),
    raw: event,
  }
}
