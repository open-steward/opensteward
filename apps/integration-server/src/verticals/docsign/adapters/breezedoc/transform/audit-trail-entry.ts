import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * BreezeDoc exposes no dedicated audit-event endpoint. The adapter
 * synthesises canonical AuditTrailEntry rows from the per-recipient
 * timestamps (`sent_at`, `opened_at` → viewed, `completed_at` → signed)
 * in index.ts. This transform normalises one (recipient × event) tuple.
 */
export interface SyntheticBreezedocAuditEvent {
  envelopeId: string
  occurredIso: string
  type: 'created' | 'sent' | 'viewed' | 'signed' | 'completed'
  signerExternalId?: string
  signerEmail?: string
  signerName?: string
  description: string
}

const TYPE_MAP: Record<SyntheticBreezedocAuditEvent['type'], AuditTrailEventType> = {
  created: 'created',
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
  completed: 'completed',
}

export function transformAuditTrailEntry(
  e: SyntheticBreezedocAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${e.envelopeId}:${index}`,
    externalId: `${e.envelopeId}:${index}`,
    envelopeId: e.envelopeId,
    occurredAt: toIso(e.occurredIso) ?? new Date(0).toISOString(),
    eventType: TYPE_MAP[e.type],
    description: e.description,
    actorId: pickStr(e.signerExternalId),
    actorEmail: pickStr(e.signerEmail),
    actorName: pickStr(e.signerName),
    platform: 'breezedoc',
    metadata: strMap({ rawType: e.type }),
    raw: e,
  }
}
