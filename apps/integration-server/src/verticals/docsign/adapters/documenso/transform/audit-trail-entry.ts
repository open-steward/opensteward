import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Documenso v1 exposes no audit-log endpoint, but the document + recipient
 * timestamps reconstruct the signing timeline. The adapter synthesises one
 * canonical AuditTrailEntry per known timestamp; each carries an ISO-8601
 * `occurredAt` (already normalised by the caller) so this transform never
 * re-parses a raw datetime.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  /** Pre-normalised ISO-8601 timestamp. */
  occurredAt: string
  type: AuditTrailEventType
  description: string
  actorId?: string
  actorEmail?: string
  actorName?: string
}

export function transformAuditTrailEntry(
  event: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${event.envelopeId}:${index}`,
    externalId: `${event.envelopeId}:${index}`,
    envelopeId: event.envelopeId,
    occurredAt: toIso(event.occurredAt) ?? new Date(0).toISOString(),
    eventType: event.type,
    description: event.description,
    actorId: pickStr(event.actorId),
    actorEmail: pickStr(event.actorEmail),
    actorName: pickStr(event.actorName),
    actorIp: undefined,
    platform: 'documenso',
    metadata: strMap({
      actorEmail: event.actorEmail,
      actorName: event.actorName,
    }),
    raw: event,
  }
}
