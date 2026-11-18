import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * A row in a LegalDesk eSign transaction's audit trail — the compliance
 * evidence for the Aadhaar eSign flow. LegalDesk returns these as a list of
 * timestamped activity rows. Where a dedicated audit endpoint is not
 * exposed on the customer's plan, the adapter synthesises rows from the
 * transaction + per-signer timestamps and feeds them through this same
 * transform (the field names below cover both shapes).
 */
export interface RawLegaldeskAuditEvent {
  event?: string
  event_type?: string
  action?: string
  description?: string
  occurred_at?: string | number
  timestamp?: string | number
  time?: string | number
  actor_id?: string
  signer_id?: string
  actor_email?: string
  signer_email?: string
  actor_name?: string
  signer_name?: string
  ip_address?: string
  ip?: string
  location?: string
  [key: string]: unknown
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('create') || a.includes('initiat')) return 'created'
  if (a.includes('sent') || a.includes('notif')) return 'sent'
  if (a.includes('view') || a.includes('open')) return 'viewed'
  if (a.includes('complete')) return 'completed'
  if (a.includes('sign') || a.includes('esign')) return 'signed'
  if (a.includes('declin') || a.includes('reject')) return 'declined'
  if (a.includes('cancel') || a.includes('void') || a.includes('revok')) return 'voided'
  if (a.includes('expire')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('auth')) return 'authenticated'
  if (a.includes('fail')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawLegaldeskAuditEvent,
  transactionId: string,
  index: number,
): AuditTrailEntry {
  const action = pickStr(raw.event) ?? pickStr(raw.event_type) ?? pickStr(raw.action)
  const occurredAt =
    toIsoDatetime(raw.occurred_at ?? raw.timestamp ?? raw.time) ?? new Date(0).toISOString()
  return {
    id: `${transactionId}:${index}`,
    externalId: `${transactionId}:${index}`,
    envelopeId: transactionId,
    occurredAt,
    eventType: mapEventType(action),
    description: pickStr(raw.description) ?? action ?? '',
    actorId: pickStr(raw.actor_id) ?? pickStr(raw.signer_id),
    actorEmail: pickStr(raw.actor_email) ?? pickStr(raw.signer_email),
    actorName: pickStr(raw.actor_name) ?? pickStr(raw.signer_name),
    actorIp: pickStr(raw.ip_address) ?? pickStr(raw.ip),
    platform: 'legaldesk',
    metadata: strMap({ event: action, location: raw.location }),
    raw,
  }
}
