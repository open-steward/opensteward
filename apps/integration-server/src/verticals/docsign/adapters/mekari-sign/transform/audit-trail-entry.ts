import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Mekari Sign does not expose a dedicated audit-event endpoint. The adapter
 * synthesises canonical AuditTrailEntry rows in index.ts from the document
 * lifecycle timestamps and the per-signer timestamps (sent / viewed /
 * signed / declined). The transform here normalises a single synthesised
 * event into the canonical shape.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt?: string
  type: AuditTrailEventType
  description: string
  actorId?: string
  actorEmail?: string
  actorName?: string
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
    platform: 'mekari-sign',
    metadata: strMap({ rawType: e.type }),
    raw: e,
  }
}
