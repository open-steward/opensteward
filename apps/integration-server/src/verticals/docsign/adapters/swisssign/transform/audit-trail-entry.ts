import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

export interface RawSwissSignAuditEntry {
  event?: string
  occurred_at?: string
  actor?: { id?: string; email?: string; name?: string; ip?: string }
  description?: string
  [key: string]: unknown
}

function mapEvent(s: string | undefined): AuditTrailEventType {
  const t = (s ?? '').toLowerCase()
  if (t.includes('create')) return 'created'
  if (t.includes('sent') || t.includes('send')) return 'sent'
  if (t.includes('view') || t.includes('open')) return 'viewed'
  if (t.includes('sign') || t.includes('complete')) return 'signed'
  if (t.includes('decline')) return 'declined'
  if (t.includes('cancel') || t.includes('void')) return 'voided'
  if (t.includes('expire')) return 'expired'
  if (t.includes('remind')) return 'auto_reminded'
  if (t.includes('auth')) return 'authenticated'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawSwissSignAuditEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  return {
    id: `${envelopeId}:${index}`,
    externalId: `${envelopeId}:${index}`,
    envelopeId,
    occurredAt: toIso(raw.occurred_at) ?? new Date(0).toISOString(),
    eventType: mapEvent(raw.event),
    description: pickStr(raw.description) ?? pickStr(raw.event) ?? '',
    actorId: pickStr(raw.actor?.id),
    actorEmail: pickStr(raw.actor?.email),
    actorName: pickStr(raw.actor?.name),
    actorIp: pickStr(raw.actor?.ip),
    platform: 'swisssign',
    metadata: strMap({}),
    raw,
  }
}
