import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { strMap } from './shared'

/**
 * One element of `audit-events` from `GET /api/packages/{packageId}/audit`.
 * Every field is from the documented response payload at
 * https://docs.onespan.com/docs/retrieving-an-audit-trail (REST API tab).
 */
export interface RawOneSpanAuditEvent {
  type?: string
  /** e.g. "2016-04-20 14:14:51" — no zone in the documented payload. */
  'date-time'?: string
  target?: string | null
  user?: string | null
  'user-email'?: string | null
  'user-ip'?: string | null
  data?: string | null
}

/**
 * Only the `type` values the documented example shows are mapped. OneSpan
 * publishes no list of audit types, so anything else (including the
 * documented "Signing Session For Signer") is `other`, with the verbatim
 * type kept in `description`.
 */
const EVENT_TYPES: Record<string, AuditTrailEventType> = {
  View: 'viewed',
  'Click To Sign': 'signed',
}

const DOCUMENTED_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const part = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return asUtc - utcMs
}

/**
 * Reads OneSpan's documented `YYYY-MM-DD HH:mm:ss` as wall time in
 * `timeZone` (an IANA zone the connection names). The docs give the value
 * no zone, so it is never read in the process's zone and never guessed.
 */
export function oneSpanDateTimeToIso(value: unknown, timeZone: string): string {
  const m = typeof value === 'string' ? DOCUMENTED_DATE_TIME.exec(value) : null
  if (!m) {
    throw new Error(
      `OneSpan audit event date-time ${JSON.stringify(value)} is not the documented "YYYY-MM-DD HH:mm:ss"`,
    )
  }
  const wall = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  )
  const first = wall - zoneOffsetMs(wall, timeZone)
  return new Date(wall - zoneOffsetMs(first, timeZone)).toISOString()
}

export function transformAuditTrailEntry(
  raw: RawOneSpanAuditEvent,
  envelopeId: string,
  index: number,
  timeZone: string,
): AuditTrailEntry {
  if (typeof raw.type !== 'string' || raw.type === '') {
    throw new Error(`OneSpan audit event ${envelopeId}:${index} has no type`)
  }
  const id = `${envelopeId}:${index}`
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt: oneSpanDateTimeToIso(raw['date-time'], timeZone),
    eventType: EVENT_TYPES[raw.type] ?? 'other',
    description: raw.type,
    actorEmail: raw['user-email'] || undefined,
    actorName: raw.user || undefined,
    actorIp: raw['user-ip'] || undefined,
    platform: 'onespan-sign',
    metadata: strMap({ target: raw.target, data: raw.data }),
    raw,
  }
}
