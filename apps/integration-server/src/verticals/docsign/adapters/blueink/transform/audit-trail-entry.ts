import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Blueink bundle event → canonical AuditTrailEntry. The bundle event log
 * (`GET /bundles/{id}/events/`) returns rows with a `kind` verb, a
 * human-readable `description`, an ISO `timestamp`, and an optional
 * `packet_id` linking the event to a signer.
 */
export interface RawBlueinkEvent {
  kind?: string
  description?: string
  timestamp?: string
  packet_id?: string
  [key: string]: unknown
}

function mapEventType(kind: string | undefined): AuditTrailEventType {
  const k = (kind ?? '').toLowerCase()
  if (k.includes('create') || k.includes('new')) return 'created'
  if (k.includes('sent') || k.includes('launch')) return 'sent'
  if (k.includes('view') || k.includes('open')) return 'viewed'
  if (k.includes('sign') || k.includes('complet')) return 'signed'
  if (k.includes('declin')) return 'declined'
  if (k.includes('cancel') || k.includes('void')) return 'voided'
  if (k.includes('expir')) return 'expired'
  if (k.includes('remind')) return 'auto_reminded'
  if (k.includes('auth')) return 'authenticated'
  if (k.includes('error') || k.includes('fail') || k.includes('bounce')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawBlueinkEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIsoDatetime(raw.timestamp) ?? new Date(0).toISOString(),
    eventType: mapEventType(raw.kind),
    description: pickStr(raw.description) ?? pickStr(raw.kind) ?? '',
    actorId: pickStr(raw.packet_id),
    platform: 'blueink',
    metadata: strMap({ kind: raw.kind, packetId: raw.packet_id }),
    raw,
  }
}
