import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Certinal has no dedicated audit-event endpoint; the compliance trail is
 * reconstructed from the transaction's own timestamps and each candidate's
 * `action` + `actionDate`. The adapter builds these SyntheticAuditEvent rows
 * in index.ts and this transform normalises one row into the canonical shape.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt?: string
  type: AuditTrailEventType
  description: string
  actorId?: string
  actorName?: string
  actorEmail?: string
  rawAction?: string
}

export function transformAuditTrailEntry(
  e: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${e.envelopeId}:${index}`,
    externalId: `${e.envelopeId}:${index}`,
    envelopeId: e.envelopeId,
    occurredAt: toIso(e.occurredAt) ?? new Date(0).toISOString(),
    eventType: e.type,
    description: e.description,
    actorId: pickStr(e.actorId),
    actorEmail: pickStr(e.actorEmail),
    actorName: pickStr(e.actorName),
    platform: 'certinal',
    metadata: strMap({ rawAction: e.rawAction }),
    raw: e,
  }
}
