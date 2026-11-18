import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Anvil does not expose a stable, separately-queryable audit-event resource
 * (the `etchLogEvents` field exists on a packet but its shape is undocumented
 * and unaddressable). Following the canonical "missing-rather-than-wrong"
 * rule, the adapter synthesises AuditTrailEntry rows in `index.ts` from the
 * documented packet- and signer-level timestamps. This transform normalises a
 * single synthetic (event) tuple.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt?: string
  type: 'created' | 'sent' | 'viewed' | 'signed' | 'completed'
  signerEid?: string
  signerEmail?: string
  signerName?: string
  description: string
}

const TYPE_MAP: Record<SyntheticAuditEvent['type'], AuditTrailEventType> = {
  created: 'created',
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
  completed: 'completed',
}

export function transformAuditTrailEntry(
  e: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${e.envelopeId}:${index}`,
    externalId: `${e.envelopeId}:${index}`,
    envelopeId: e.envelopeId,
    occurredAt: toIsoDatetime(e.occurredAt) ?? new Date(0).toISOString(),
    eventType: TYPE_MAP[e.type],
    description: e.description,
    actorId: pickStr(e.signerEid),
    actorEmail: pickStr(e.signerEmail),
    actorName: pickStr(e.signerName),
    platform: 'anvil',
    metadata: strMap({ rawType: e.type }),
    raw: e,
  }
}
