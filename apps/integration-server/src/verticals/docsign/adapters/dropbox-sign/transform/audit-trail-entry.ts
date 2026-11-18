import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { epochToIso, pickStr, strMap } from './shared'

/**
 * Dropbox Sign exposes per-signer timestamps (signed_at, last_viewed_at,
 * last_reminded_at, declined) rather than a separate audit-event endpoint.
 * The adapter synthesises canonical AuditTrailEntry rows from those
 * timestamps in `index.ts`. The transform here normalises a single
 * (signer × event) tuple.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredUnix: number
  type: 'created' | 'sent' | 'viewed' | 'signed' | 'declined' | 'auto_reminded' | 'completed'
  signerEmail?: string
  signerName?: string
  signatureId?: string
  description: string
}

const TYPE_MAP: Record<SyntheticAuditEvent['type'], AuditTrailEventType> = {
  created: 'created',
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
  declined: 'declined',
  auto_reminded: 'auto_reminded',
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
    occurredAt: epochToIso(e.occurredUnix) ?? new Date(0).toISOString(),
    eventType: TYPE_MAP[e.type],
    description: e.description,
    actorEmail: pickStr(e.signerEmail),
    actorName: pickStr(e.signerName),
    actorId: pickStr(e.signatureId),
    platform: 'dropbox-sign',
    metadata: strMap({ rawType: e.type }),
    raw: e,
  }
}
