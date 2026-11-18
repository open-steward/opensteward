import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * SigniFlow exposes POST /GetDocumentAudit which returns an ActivityField
 * array of real per-event audit records. This transform normalises a single
 * ActivityField entry into a canonical AuditTrailEntry. Timestamps are
 * coerced to strict ISO-8601; the raw activity object is preserved on `raw`.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt: string | undefined
  type: AuditTrailEventType
  description: string
  actorId?: string
  actorEmail?: string
  actorName?: string
}

export function transformAuditTrailEntry(
  e: SyntheticAuditEvent,
  index: number,
  rawActivity?: unknown,
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
    platform: 'signiflow',
    metadata: strMap({ rawType: e.type }),
    raw: rawActivity ?? e,
  }
}
