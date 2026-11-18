import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * A SignDesk audit-trail activity. SignDesk surfaces the audit trail as a
 * first-class concept (delivered alongside completed documents on the
 * callback and queryable per request).
 */
export interface RawSigndeskAuditEntry {
  event?: string
  activity?: string
  action?: string
  occurred_on?: string
  timestamp?: string | number
  description?: string
  remarks?: string
  signatory_id?: string
  signatory_email?: string
  signatory_name?: string
  ip_address?: string
  [key: string]: unknown
}

function mapType(name: string | undefined): AuditTrailEventType {
  const n = (name ?? '').toLowerCase()
  if (n.includes('create') || n.includes('upload') || n.includes('initiat')) return 'created'
  if (n.includes('request') || n.includes('send') || n.includes('sent') || n.includes('notif'))
    return 'sent'
  if (n.includes('view') || n.includes('open')) return 'viewed'
  if (n.includes('sign') || n.includes('execut')) return 'signed'
  if (n.includes('decline') || n.includes('reject')) return 'declined'
  if (n.includes('cancel') || n.includes('void') || n.includes('withdraw')) return 'voided'
  if (n.includes('complete') || n.includes('finish')) return 'completed'
  if (n.includes('expire')) return 'expired'
  if (n.includes('remind')) return 'auto_reminded'
  if (n.includes('auth') || n.includes('otp') || n.includes('verif')) return 'authenticated'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawSigndeskAuditEntry,
  envId: string,
  index: number,
): AuditTrailEntry {
  const name = raw.event ?? raw.activity ?? raw.action
  const occurredAt = toIso(raw.occurred_on) ?? toIso(raw.timestamp) ?? new Date(0).toISOString()
  return {
    id: `${envId}:${index}`,
    externalId: `${envId}:${index}`,
    envelopeId: envId,
    occurredAt,
    eventType: mapType(name),
    description: pickStr(raw.description) ?? pickStr(raw.remarks) ?? pickStr(name) ?? '',
    actorId: pickStr(raw.signatory_id),
    actorEmail: /@/.test(raw.signatory_email ?? '') ? String(raw.signatory_email) : undefined,
    actorName: pickStr(raw.signatory_name),
    actorIp: pickStr(raw.ip_address),
    platform: 'signdesk',
    metadata: strMap({
      event: name,
      remarks: raw.remarks,
    }),
    raw,
  }
}
