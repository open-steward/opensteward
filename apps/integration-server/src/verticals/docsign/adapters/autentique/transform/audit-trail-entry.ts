import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Autentique has no separate audit-events endpoint; the adapter synthesises
 * canonical AuditTrailEntry rows from per-signer timestamps + the document
 * lifecycle (created / completed / declined).
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt?: string
  type: 'created' | 'sent' | 'viewed' | 'signed' | 'declined' | 'completed'
  signerEmail?: string
  signerName?: string
  signerId?: string
  ip?: string
  description: string
}

const TYPE_MAP: Record<SyntheticAuditEvent['type'], AuditTrailEventType> = {
  created: 'created',
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
  declined: 'declined',
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
    actorId: pickStr(e.signerId),
    actorEmail: pickStr(e.signerEmail),
    actorName: pickStr(e.signerName),
    actorIp: pickStr(e.ip),
    platform: 'autentique',
    metadata: strMap({ rawType: e.type }),
    raw: e,
  }
}
