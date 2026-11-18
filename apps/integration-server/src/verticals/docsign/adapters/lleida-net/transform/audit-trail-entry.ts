import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Click & Sign exposes no dedicated audit-events endpoint; the audit trail is
 * synthesised from the signature + signatory status timestamps returned by
 * `get_signature_list` / `get_signatory_details`. Each synthetic event below
 * carries the source UNIX-seconds timestamp + actor context.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredUnix: number | string
  type: AuditTrailEventType
  description: string
  signatoryId?: string
  actorName?: string
  actorEmail?: string
  actorIp?: string
}

export function transformAuditTrailEntry(
  event: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(event.occurredUnix) ?? new Date(0).toISOString()
  return {
    id: `${event.envelopeId}:${index}`,
    externalId: `${event.envelopeId}:${index}`,
    envelopeId: event.envelopeId,
    occurredAt,
    eventType: event.type,
    description: event.description,
    actorId: pickStr(event.signatoryId),
    actorEmail: pickStr(event.actorEmail),
    actorName: pickStr(event.actorName),
    actorIp: pickStr(event.actorIp),
    platform: 'lleida-net',
    metadata: strMap({
      signatory_id: event.signatoryId,
      source: 'synthesized',
    }),
    raw: event,
  }
}
