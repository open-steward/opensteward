/**
 * Transform a raw Flowmono recipient action log entry into the canonical
 * AuditTrailEntry shape.
 *
 * Audit / activity data is obtained from:
 *   POST /api/RecipientActionLog/getrecipientactionlogs
 *   GET  /api/UserActivity/getuseractivitybysigningrequestid/{subscriberId}/{userId}/{signingRequestGuId}/{skip}/{take}
 *
 * The swagger defines GetRecipientActionLogsQuery but does not expose the
 * response entity shape; fields here are inferred from the platform's domain
 * model (action, actor, timestamp).
 */
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Flowmono recipient action log entry from Result.entity items.
 */
export interface RawFlowmonoActionLog {
  id?: number | string
  /** Signing request reference number. */
  signingRequestId?: string | number
  /** Recipient email address. */
  recipientEmail?: string
  recipientName?: string
  /** Action performed: "Signed", "Declined", "Viewed", "Sent", etc. */
  action?: string
  /** ISO 8601 timestamp of when the action occurred. */
  actionDate?: string
  createdDate?: string
  /** IP address of the actor. */
  ipAddress?: string
  userId?: string
  userEmail?: string
  userName?: string
  [key: string]: unknown
}

function mapEventType(action: string | undefined): AuditTrailEventType {
  const a = (action ?? '').toLowerCase()
  if (a.includes('created') || a.includes('initiated')) return 'created'
  if (a.includes('sent')) return 'sent'
  if (a.includes('view')) return 'viewed'
  if (a.includes('sign') || a.includes('complet')) return 'signed'
  if (a.includes('declin')) return 'declined'
  if (a.includes('void')) return 'voided'
  if (a.includes('expir')) return 'expired'
  if (a.includes('remind')) return 'auto_reminded'
  if (a.includes('auth')) return 'authenticated'
  if (a.includes('reassign')) return 'reassigned'
  if (a.includes('correct')) return 'corrected'
  if (a.includes('fail')) return 'delivery_failed'
  return 'other'
}

export function transformAuditTrailEntry(
  raw: RawFlowmonoActionLog,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt =
    toIso(raw.actionDate) ?? toIso(raw.createdDate) ?? new Date(0).toISOString()
  const idStr = pickStr(raw.id) ?? `${envelopeId}:${index}`
  return {
    id: `${envelopeId}:${idStr}`,
    externalId: idStr,
    envelopeId,
    occurredAt,
    eventType: mapEventType(raw.action),
    description: pickStr(raw.action) ?? '',
    actorId: pickStr(raw.userId),
    actorEmail: pickStr(raw.userEmail) ?? pickStr(raw.recipientEmail),
    actorName: pickStr(raw.userName) ?? pickStr(raw.recipientName),
    actorIp: pickStr(raw.ipAddress),
    platform: 'flowmono',
    metadata: strMap({ recipientEmail: raw.recipientEmail, recipientName: raw.recipientName }),
    raw,
  }
}
