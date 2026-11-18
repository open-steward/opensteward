/**
 * YetiForce raw datetimes to ISO 8601.
 *
 * With `x-raw-data: 1`, records come back "in the system format as stored in
 * a database" (Record_Raw_Details in
 * https://doc.yetiforce.com/api/7x/WebservicePremium.json), e.g.
 * `"createdtime": "2014-09-24 20:51:12"`: no offset. The zone they are in is
 * the Users/Login response's `preferences.raw_time_zone`, documented as
 * "System main time zone (data in database format)", example `UTC`.
 */

const WALL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Milliseconds `timeZone` is ahead of UTC at `instant`, or undefined for an unknown zone. */
function offsetMs(instant: number, timeZone: string): number | undefined {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant))
  } catch {
    return undefined
  }
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * A `YYYY-MM-DD HH:MM:SS` wall time in `timeZone` as an ISO instant, or
 * undefined when the value is not that shape or the zone is unknown.
 */
export function wallTimeToIso(value: unknown, timeZone: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = WALL.exec(value.trim())
  if (!m) return undefined
  const [, y, mo, d, h, mi, s] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const wall = Date.UTC(y, mo - 1, d, h, mi, s)
  const first = offsetMs(wall, timeZone)
  if (first === undefined) return undefined
  let instant = wall - first
  // Across a DST change the offset at the guess can differ from the offset at the answer.
  const second = offsetMs(instant, timeZone)
  if (second !== undefined && second !== first) instant = wall - second
  return new Date(instant).toISOString()
}

/** A `YYYY-MM-DD` date field (uitype 5) as midnight UTC, or undefined. */
export function dateToIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = DATE.exec(value.trim())
  if (!m) return undefined
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/**
 * A reference or owner field's raw value as an id: YetiForce stores record and
 * user ids as integers, and an empty reference as 0 or an empty string.
 */
export function refId(value: unknown): string | undefined {
  if (typeof value === 'number')
    return Number.isInteger(value) && value > 0 ? String(value) : undefined
  if (typeof value === 'string') return /^[1-9]\d*$/.test(value.trim()) ? value.trim() : undefined
  return undefined
}

/** A non-empty string field, else undefined. */
export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}
