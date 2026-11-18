import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { epochToIso, pickStr, strMap } from './shared'

/**
 * BoldSign surfaces the audit trail as a `documentHistory` array on the
 * document properties response. Each entry records an action, the actor, and
 * the time it occurred (Unix epoch seconds). Field names are loosely
 * documented, so we read several aliases defensively.
 */
export interface RawBoldsignHistoryEvent {
  action?: string
  actionType?: string
  description?: string
  date?: number
  createdDate?: number
  activityDate?: number
  userName?: string
  fromName?: string
  userEmail?: string
  fromEmail?: string
  ipAddress?: string
  [key: string]: unknown
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('create') || a.includes('draft')) return 'created'
  if (a.includes('sent') || a.includes('send')) return 'sent'
  if (a.includes('view') || a.includes('open')) return 'viewed'
  if (a.includes('sign') || a.includes('complete')) return 'signed'
  if (a.includes('decline')) return 'declined'
  if (a.includes('revoke')) return 'voided'
  if (a.includes('expire')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('reassign')) return 'reassigned'
  if (a.includes('edit') || a.includes('correct')) return 'corrected'
  if (a.includes('auth')) return 'authenticated'
  if (a.includes('fail') || a.includes('bounce')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawBoldsignHistoryEvent,
  documentId: string,
  index: number,
): AuditTrailEntry {
  const action = raw.action ?? raw.actionType
  const occurredAt =
    epochToIso(raw.date ?? raw.activityDate ?? raw.createdDate) ?? new Date(0).toISOString()
  return {
    id: `${documentId}:${index}`,
    externalId: `${documentId}:${index}`,
    envelopeId: documentId,
    occurredAt,
    eventType: mapEventType(action),
    description: pickStr(raw.description) ?? pickStr(action) ?? '',
    actorEmail: pickStr(raw.userEmail ?? raw.fromEmail),
    actorName: pickStr(raw.userName ?? raw.fromName),
    actorIp: pickStr(raw.ipAddress),
    platform: 'boldsign',
    metadata: strMap({ action, ipAddress: raw.ipAddress }),
    raw,
  }
}
