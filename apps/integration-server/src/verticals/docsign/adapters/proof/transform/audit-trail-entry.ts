import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { strMap, toIso } from './shared'

/**
 * Proof does not expose a per-event audit-log endpoint over the API key —
 * the audit trail is delivered as a presigned PDF (`audit_trail_url`, content
 * REFUSED here). What IS structured and machine-readable is the transaction
 * lifecycle plus the notarization records (the notarization meeting IS the
 * compliance evidence for a Proof transaction). The adapter synthesises
 * canonical AuditTrailEntries from those structured timestamps.
 */
export interface SyntheticProofAuditEvent {
  envelopeId: string
  occurredAt: string
  type: AuditTrailEventType
  description: string
  /** Stable external id segment so the synthetic entry is addressable. */
  key: string
  actorName?: string
}

export function transformAuditTrailEntry(
  event: SyntheticProofAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${event.envelopeId}:${index}`,
    externalId: `${event.envelopeId}:${event.key}`,
    envelopeId: event.envelopeId,
    occurredAt: toIso(event.occurredAt) ?? new Date(0).toISOString(),
    eventType: event.type,
    description: event.description,
    actorName: event.actorName,
    platform: 'proof',
    metadata: strMap({ key: event.key }),
    raw: event,
  }
}
