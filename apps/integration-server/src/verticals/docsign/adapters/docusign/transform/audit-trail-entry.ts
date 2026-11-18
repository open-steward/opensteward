import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

export interface RawDocuSignAuditEvent {
  eventFields?: Array<{ name: string; value: string }>
  /**
   * DocuSign returns rows under the `auditEvents` array; each item has only
   * eventFields (name/value pairs). We coerce by name.
   */
  [key: string]: unknown
}

function fieldsToMap(raw: RawDocuSignAuditEvent): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of raw.eventFields ?? []) {
    if (typeof f.name === 'string' && typeof f.value === 'string') out[f.name] = f.value
  }
  return out
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('created')) return 'created'
  if (a.includes('sent')) return 'sent'
  if (a.includes('viewed')) return 'viewed'
  if (a.includes('signed') || a.includes('completed')) return 'signed'
  if (a.includes('declined')) return 'declined'
  if (a.includes('voided')) return 'voided'
  if (a.includes('expired')) return 'expired'
  if (a.includes('reminder')) return 'auto_reminded'
  if (a.includes('authent')) return 'authenticated'
  if (a.includes('reassigned')) return 'reassigned'
  if (a.includes('correct')) return 'corrected'
  if (a.includes('failure') || a.includes('failed')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawDocuSignAuditEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const fields = fieldsToMap(raw)
  const occurredAt = toIso(fields['logTime']) ?? new Date(0).toISOString()
  return {
    id: `${envelopeId}:${index}`,
    externalId: fields['eventId'] ?? `${envelopeId}:${index}`,
    envelopeId,
    occurredAt,
    eventType: mapEventType(fields['action']),
    description: fields['description'] ?? fields['action'] ?? '',
    actorId: pickStr(fields['userId']),
    actorEmail: pickStr(fields['userEmail']),
    actorName: pickStr(fields['userName']),
    actorIp: pickStr(fields['clientIPAddress']),
    platform: 'docusign',
    metadata: strMap(fields),
    raw,
  }
}
