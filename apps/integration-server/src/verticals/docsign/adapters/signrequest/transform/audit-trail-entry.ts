import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, strMap, toIsoDatetime } from './shared'
import type { RawSignRequestSigner, RawSignRequestDocument } from './envelope'

/**
 * SignRequest Events (`/events/`) are the audit trail. Each event carries an
 * `event_type`, a `timestamp`, a nested `document`, and (for signer-scoped
 * events) a nested `signer`. We key the canonical AuditTrailEntry by the
 * event uuid and resolve actor identity from the embedded signer.
 */
export interface RawSignRequestEvent {
  uuid?: string
  status?: string
  event_type?: string
  delivered?: boolean
  delivered_on?: string | null
  callback_status_code?: number | null
  timestamp?: string
  document?: (RawSignRequestDocument | { uuid?: string }) | null
  signer?: RawSignRequestSigner | null
  team?: { subdomain?: string; name?: string } | null
  [key: string]: unknown
}

/**
 * SignRequest event_type values (uppercase on the wire). Mapped to the
 * canonical audit-trail event taxonomy; anything unrecognised → 'other'.
 */
function mapEventType(raw: string | undefined): AuditTrailEventType {
  switch ((raw ?? '').toUpperCase()) {
    case 'CONVERTED':
    case 'CONVERT':
      return 'created'
    case 'SENT':
    case 'SENT_TO_SIGNER':
      return 'sent'
    case 'VIEWED':
    case 'SIGNER_VIEWED':
    case 'SIGNER_VIEWED_EMAIL':
      return 'viewed'
    case 'SIGNED':
    case 'SIGNER_SIGNED':
    case 'DOWNLOADED':
    case 'SIGNED_AND_FINISHED':
      return 'signed'
    case 'DECLINED':
    case 'SIGNER_DECLINED':
      return 'declined'
    case 'CANCELLED':
    case 'CANCELED':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    case 'SIGNER_NEEDS_TO_SIGN':
    case 'SIGNER_REMINDED':
      return 'auto_reminded'
    case 'SIGNER_EMAIL_BOUNCED':
      return 'delivery_failed'
    case 'SIGNER_FORWARDED':
      return 'reassigned'
    default:
      return 'other'
  }
}

function documentUuid(event: RawSignRequestEvent): string {
  const doc = event.document
  if (doc && typeof doc === 'object' && 'uuid' in doc && typeof doc.uuid === 'string') {
    return doc.uuid
  }
  return ''
}

function signerName(s: RawSignRequestSigner | null | undefined): string | undefined {
  if (!s) return undefined
  if (s.display_name && s.display_name.length > 0) return s.display_name
  const joined = [s.first_name, s.last_name].filter(Boolean).join(' ')
  return joined.length > 0 ? joined : undefined
}

export function transformAuditTrailEntry(
  raw: RawSignRequestEvent,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const id = raw.uuid ?? `${envelopeId}:${index}`
  const occurredAt = toIsoDatetime(raw.timestamp) ?? new Date(0).toISOString()
  const eventType = raw.event_type ?? ''
  return {
    id,
    externalId: raw.uuid ?? id,
    envelopeId: envelopeId || documentUuid(raw),
    occurredAt,
    eventType: mapEventType(eventType),
    description: eventType,
    actorId: pickStr(raw.signer?.uuid),
    actorEmail: pickStr(raw.signer?.email),
    actorName: signerName(raw.signer),
    platform: 'signrequest',
    metadata: strMap({
      eventType,
      status: raw.status,
      delivered: raw.delivered,
      deliveredOn: raw.delivered_on,
      callbackStatusCode: raw.callback_status_code,
    }),
    raw,
  }
}
