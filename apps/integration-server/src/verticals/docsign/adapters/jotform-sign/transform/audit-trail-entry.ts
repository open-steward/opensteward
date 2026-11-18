import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Jotform has no dedicated audit-event endpoint. The adapter synthesises the
 * canonical audit trail in `index.ts` from the Sign document's lifecycle
 * timestamps (the form `created_at`) and each submission's `created_at`
 * (a "signed" event). The transform here normalises one synthesised tuple.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  /** Jotform timestamp string (`YYYY-MM-DD HH:MM:SS`) or undefined. */
  occurredAt?: string
  type: 'created' | 'signed' | 'completed'
  signerEmail?: string
  signerName?: string
  submissionId?: string
  actorIp?: string
  description: string
}

const TYPE_MAP: Record<SyntheticAuditEvent['type'], AuditTrailEventType> = {
  created: 'created',
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
    occurredAt: toIso(e.occurredAt) ?? new Date(0).toISOString(),
    eventType: TYPE_MAP[e.type],
    description: e.description,
    actorId: pickStr(e.submissionId),
    actorEmail: pickStr(e.signerEmail),
    actorName: pickStr(e.signerName),
    actorIp: pickStr(e.actorIp),
    platform: 'jotform-sign',
    metadata: strMap({ rawType: e.type }),
    raw: e,
  }
}
