import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIso } from './shared'

/**
 * Signzy Contract360 has no dedicated audit-event endpoint. Instead, each
 * signer in a contract carries a `notificationdetails[]` timeline (signing
 * link, OTP, reminder, confirmation, audit events), and the contract exposes
 * sign / completion timestamps. The adapter synthesises canonical
 * AuditTrailEntry rows from those signals; this transform normalises a single
 * synthesised tuple.
 */
export interface SyntheticAuditEvent {
  envelopeId: string
  occurredAt?: string
  type: AuditTrailEventType
  description: string
  signerId?: string
  signerName?: string
  signerIp?: string
  channel?: string
  event?: string
  status?: string
  vendorId?: string
  notificationId?: string
}

/**
 * Map a Signzy notification `event` (sendsigninglink, sendconfirmation,
 * sendaudit, sendotp, sendreminder, sendreviewer) to a canonical event type.
 */
export function mapNotificationEvent(event: string | undefined): AuditTrailEventType {
  const e = (event ?? '').toLowerCase()
  if (e.includes('signinglink')) return 'sent'
  if (e.includes('reminder')) return 'auto_reminded'
  if (e.includes('confirmation')) return 'completed'
  if (e.includes('audit')) return 'other'
  if (e.includes('otp')) return 'authenticated'
  if (e.includes('reviewer')) return 'sent'
  return 'other'
}

export function transformAuditTrailEntry(
  e: SyntheticAuditEvent,
  index: number,
): AuditTrailEntry {
  return {
    id: `${e.envelopeId}:${index}`,
    externalId: e.notificationId ?? `${e.envelopeId}:${index}`,
    envelopeId: e.envelopeId,
    occurredAt: toIso(e.occurredAt) ?? new Date(0).toISOString(),
    eventType: e.type,
    description: e.description,
    actorId: pickStr(e.signerId),
    actorName: pickStr(e.signerName),
    actorIp: pickStr(e.signerIp),
    platform: 'signzy',
    metadata: strMap({
      event: e.event,
      channel: e.channel,
      status: e.status,
      vendorid: e.vendorId,
    }),
    raw: e,
  }
}
