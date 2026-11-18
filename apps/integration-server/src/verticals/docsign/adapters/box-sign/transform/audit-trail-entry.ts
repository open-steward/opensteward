import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Box Sign exposes no first-class audit endpoint — we synthesise events
 * from per-signer timestamps on the sign_request record. The transform
 * is fed a flat synthetic event tuple.
 */
export interface SyntheticBoxSignAuditEvent {
  envelopeId: string
  occurredAtIso: string
  type: AuditTrailEventType
  description: string
  signerId?: string
  signerEmail?: string
  signerName?: string
}

export function transformAuditTrailEntry(
  raw: SyntheticBoxSignAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${raw.envelopeId}:${index}`,
    externalId: `${raw.envelopeId}:${index}`,
    envelopeId: raw.envelopeId,
    occurredAt: toIso(raw.occurredAtIso) ?? new Date(0).toISOString(),
    eventType: raw.type,
    description: pickStr(raw.description) ?? '',
    actorId: pickStr(raw.signerId),
    actorEmail: pickStr(raw.signerEmail),
    actorName: pickStr(raw.signerName),
    actorIp: undefined,
    platform: 'box-sign',
    metadata: strMap({}),
    raw,
  }
}
