import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { strMap } from './shared'

/**
 * AIS exposes no audit-log endpoint. The compliance evidence for a transaction
 * is the SignResponse result URN plus the embedded revocation information
 * (CRLs / OCSP responses) and the step-up serial number. We synthesise a small
 * ordered set of audit events from the transaction outcome so the audit trail
 * is still queryable as a first-class canonical surface.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt: string
  eventType: AuditTrailEventType
  description: string
  /** Extra fields surfaced under metadata. */
  extra?: Record<string, unknown>
}

export function transformAuditTrailEntry(
  event: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${event.envelopeId}:${index}`,
    externalId: `${event.envelopeId}:${event.eventType}`,
    envelopeId: event.envelopeId,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    description: event.description,
    platform: 'swisscom-trust-services',
    metadata: strMap(event.extra ?? {}),
    raw: event,
  }
}
