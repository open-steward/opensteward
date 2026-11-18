import { majorToMinor, minorToMajor } from '@opensteward/shared'
import type { Email, Telephone, Address } from '../../schema/shared'

/** Returns `[{ email, type: 'WORK' }]` when `email` is non-empty, otherwise `[]` */
export function toWorkEmail(email?: string | null): Email[] {
  return email ? [{ email, type: 'WORK' }] : []
}

/** Builds a single Telephone entry, or returns `undefined` when number is absent */
export function toPhone(
  number: string | undefined | null,
  type: NonNullable<Telephone['type']> = 'WORK',
): Telephone | undefined {
  return number ? { telephone: number, type } : undefined
}

/**
 * Builds an Address from loosely-typed source fields.
 * Returns `undefined` when every provided field is falsy.
 */
export function toAddress(fields: {
  address1?: string | null
  address2?: string | null
  city?: string | null
  postalCode?: string | null
  region?: string | null
  country?: string | null
}): Address | undefined {
  const addr: Address = {
    address1: fields.address1 || undefined,
    address2: fields.address2 || undefined,
    city: fields.city || undefined,
    postalCode: fields.postalCode || undefined,
    region: fields.region || undefined,
    country: fields.country || undefined,
  }
  return Object.values(addr).some(Boolean) ? addr : undefined
}

/**
 * Composes a display name from an organisation name or first+last parts.
 * `org` wins when non-empty; falls back to joined name parts; returns `undefined`
 * when all inputs are absent.
 */
export function composeName(
  org?: string | null,
  first?: string | null,
  last?: string | null,
): string | undefined {
  if (org) return org
  const parts = [first, last].filter(Boolean) as string[]
  return parts.length ? parts.join(' ') : undefined
}

/**
 * Safe `parseFloat` that returns `undefined` instead of `NaN`.
 * Also accepts a `number` directly (pass-through).
 */
export function parseDecimal(val?: string | number | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  return isNaN(n) ? undefined : n
}

/**
 * Convert a decimal amount (e.g. "12.50" or 12.5) to integer minor units
 * (e.g. 1250 cents). Returns `undefined` when input is absent or unparseable.
 *
 * Pass `currency` whenever the caller has it. Without one this assumes two
 * fractional digits, which is right for ~95% of ISO-4217 and silently wrong
 * for the rest: JPY and KRW have none, so ¥1000 would be reported as ¥100,000,
 * and KWD has three, so the amount would come out a tenth of its real value.
 * `Iso4217Currency` is regex-based, so nothing stops those codes arriving —
 * invoice-ninja's own currency table maps JPY.
 *
 * The parameter is optional so this stayed a drop-in for the ~100 call sites
 * that predate it; each becomes correct as it starts passing the currency it
 * already has in hand.
 */
export function toMinorUnits(
  val?: string | number | null,
  currency?: string | null,
): number | undefined {
  return majorToMinor(parseDecimal(val), currency)
}

/**
 * Inverse of `toMinorUnits`: integer minor units (e.g. 1250) back to the
 * decimal major amount an upstream API expects on write (e.g. 12.5). Returns
 * `undefined` when input is absent, preserving the null/zero/omitted contract
 * `Amount` documents.
 *
 * Needed by every adapter whose platform speaks decimal major units: converting
 * on read without converting on write sends amounts 100x too large upstream.
 * Same currency caveat as `toMinorUnits`, and worse when it bites — a wrong
 * read reports a bad number, a wrong write persists one on the customer's own
 * records.
 */
export function fromMinorUnits(
  val?: string | number | null,
  currency?: string | null,
): number | undefined {
  return minorToMajor(parseDecimal(val), currency)
}

/** Returns `undefined` instead of an empty array */
export function nonempty<T>(arr: T[]): T[] | undefined {
  return arr.length ? arr : undefined
}

/**
 * Namespace a platform-native id so it is unique within the canonical
 * resource it lands in.
 *
 * Accounting adapters routinely merge two upstream collections into one
 * canonical `Contact` list — Fortnox's `/customers` + `/suppliers`, QuickBooks'
 * customers + vendors, AFAS's debtors + creditors. Those collections number
 * independently, so customer #1 and supplier #1 both arrive as `"1"` and would
 * collide. The prefix is what keeps them apart, and `getContact` dispatches on
 * it to pick the right upstream endpoint.
 *
 * The canonical schema documents this as the contract, not merely a habit:
 * `Contact.id`'s example is `cus_4Qm2Xa9Lr`, and every `contactId` foreign key
 * that points at a contact carries the identical example. Both sides must be
 * built here so they cannot drift apart — prefixing the id while emitting a
 * bare FK produces a reference that silently resolves to nothing.
 *
 * Idempotent: re-prefixing an already-prefixed value returns it unchanged, so
 * applying this to a call site that was previously fixed by hand cannot
 * produce `cust_cust_1`. Only this adapter's own prefix is recognised — a
 * foreign one is treated as part of the id, since `supp_1` really is a
 * distinct id from the customer numbered `supp_1`.
 *
 * Returns `undefined` for an absent, empty or whitespace-only upstream value:
 * a reference nobody supplied is not a reference to the empty string, and
 * canonical `ExternalId` rejects empty strings anyway.
 */
export function prefixedId(
  prefix: string,
  value?: string | number | null,
): string | undefined {
  if (value === undefined || value === null) return undefined
  const raw = String(value).trim()
  if (!raw) return undefined
  return raw.startsWith(`${prefix}_`) ? raw : `${prefix}_${raw}`
}

/**
 * Inverse of `prefixedId`: recover the platform-native id for a write path.
 *
 * Write paths (`untransform*`) send the id back upstream, where the prefix is
 * meaningless — Fortnox expects `CustomerNumber: "1"`, not `"cust_1"`. Any
 * adapter that starts prefixing its reads MUST strip on its writes in the same
 * change, or it begins posting ids the platform has never seen.
 *
 * Tolerant of an already-bare value so a partially-migrated adapter keeps
 * working, and leaves a foreign prefix intact rather than blindly cutting at
 * the first underscore — platform ids legitimately contain underscores.
 */
export function unprefixedId(prefix: string, value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined
  const raw = String(value).trim()
  if (!raw) return undefined
  return raw.startsWith(`${prefix}_`) ? raw.slice(prefix.length + 1) : raw
}

/**
 * Parse a platform date string into a `Date`, reading a zoneless value as UTC.
 *
 * `new Date(s)` is not safe for platform dates. ECMAScript splits the ISO
 * forms: a date-only string (`"2026-09-01"`) is UTC, but a date-TIME string
 * with no offset (`"2026-09-01T00:00:00"`) is **local time**. Xero sends the
 * second shape for every calendar date it has — `DateString`, `DueDateString`,
 * `JournalDate` — so `new Date(raw.DateString)` produced a different instant
 * on every deployment:
 *
 *     TZ=UTC              2026-09-01T00:00:00 -> 2026-09-01T00:00:00.000Z
 *     TZ=Europe/Stockholm 2026-09-01T00:00:00 -> 2026-08-31T22:00:00.000Z   <- wrong day
 *     TZ=America/New_York 2026-09-01T00:00:00 -> 2026-09-01T04:00:00.000Z
 *
 * The calendar date is the datum — an invoice dated the 1st is dated the 1st
 * in every timezone — so the zero time is fabricated precision and the fix is
 * to pin it to UTC midnight rather than to wherever the container happens to
 * run. This was invisible in tests because the fixtures used the date-only
 * form, which was already UTC.
 *
 * A value that carries its own zone (`Z` or `±HH:MM`) is authoritative and is
 * parsed as-is — `CreatedDateUTC` and friends must not be re-read as UTC after
 * the offset has already placed them.
 *
 * Unparseable input returns `undefined` rather than an Invalid Date. An
 * Invalid Date fails `z.date()` at the response boundary, which discards the
 * whole record over one malformed field; dropping the field keeps the rest.
 */
export function toUtcDate(val?: string | Date | null): Date | undefined {
  if (val === undefined || val === null) return undefined
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val

  const raw = String(val).trim()
  if (!raw) return undefined

  // Microsoft-stack serialisation: `/Date(1788957862905+0000)/`. Xero uses it
  // for `UpdatedDateUTC`, which is exactly why it also ships `DateString` and
  // `DueDateString` as ISO companions for the fields it expects you to read.
  // `new Date()` rejects it outright, so `updatedAt` came out absent on every
  // entity even though the mapper was correct.
  //
  // The millis are already absolute UTC; the trailing offset only tells a .NET
  // client which zone to RENDER in, so applying it would move the instant.
  const dotnet = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(raw)
  if (dotnet) {
    const d = new Date(Number(dotnet[1]))
    return isNaN(d.getTime()) ? undefined : d
  }

  // Zoneless date-time (no trailing Z, no ±HH:MM / ±HHMM offset) — the only
  // form ECMAScript reads as local. Everything else already has a defined
  // instant, so leave it alone.
  const zoneless = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)
  const d = new Date(zoneless ? `${raw.replace(' ', 'T')}Z` : raw)
  return isNaN(d.getTime()) ? undefined : d
}

/**
 * Render a platform value as a CALENDAR DATE — `YYYY-MM-DD`, no time, no zone.
 *
 * For fields whose source is a date rather than an instant. Xero's
 * `DateString` is the canonical example: it means "the first of September" and
 * arrives as `"2026-09-01T00:00:00"`, zeros standing in for a time it does not
 * have. Emitting that as `"2026-09-01T00:00:00.000Z"` invents both a time and
 * a zone, and a consumer rendering the result in local time shows the previous
 * day anywhere east of UTC — an invoice near a period boundary lands in the
 * wrong month.
 *
 * Deliberately separate from {@link toUtcDate} rather than one function
 * guessing between them. Whether a field is a calendar date or an instant is a
 * property of the platform's API: `2026-09-01T00:00:00Z` IS a real midnight
 * instant, and no heuristic can tell it apart from Xero's padded date. The
 * adapter author knows; the helper should not pretend to.
 *
 * A zoned value is read in UTC, so the calendar date is the one the instant
 * falls on at UTC rather than wherever the server happens to run.
 */
export function toCalendarDate(val?: string | Date | null): string | undefined {
  if (val === undefined || val === null) return undefined

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? undefined : val.toISOString().slice(0, 10)
  }

  const raw = String(val).trim()
  if (!raw) return undefined

  // Already a bare calendar date — return it without a Date round-trip, which
  // is the whole point: no instant is ever constructed, so nothing can shift.
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (bare) return isRealDate(raw) ? raw : undefined

  // Zoneless date-time: the date part is authoritative and the time is padding.
  const zoneless = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.exec(raw)
  if (zoneless) return isRealDate(zoneless[1]!) ? zoneless[1]! : undefined

  // Anything else carries a zone, so resolve the instant and take its UTC day.
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

/** Rejects well-formed but impossible dates (`2026-13-45`, `0000-00-00`). */
function isRealDate(yyyyMmDd: string): boolean {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === yyyyMmDd
}

/**
 * Write direction: render a canonical date field as a full ISO-8601 instant.
 *
 * `postedAt`/`dueAt` are `Date | 'YYYY-MM-DD'` on the way out, so a write path
 * that needs a timestamp cannot simply call `.toISOString()`. A calendar date
 * is anchored at UTC midnight here — the fabricated time is unavoidable when
 * the target field demands one, and doing it explicitly at the boundary is
 * better than the read path inventing it for every consumer.
 *
 * Prefer {@link toCalendarDate} when the upstream field is a date: most are,
 * which is why 460 of the write sites take that form and only a handful this.
 */
export function toIsoDateTime(val?: string | Date | null): string | undefined {
  if (val === undefined || val === null) return undefined
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val.toISOString()
  const raw = String(val).trim()
  if (!raw) return undefined
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(raw)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * Write direction: a canonical date field as whole seconds since the epoch,
 * for platforms whose API takes Unix time.
 *
 * A calendar date resolves to its UTC midnight, matching {@link toIsoDateTime}.
 */
export function toEpochSeconds(val?: string | Date | null): number | undefined {
  const iso = toIsoDateTime(val)
  return iso === undefined ? undefined : Math.floor(new Date(iso).getTime() / 1000)
}

/**
 * Write direction: coerce a canonical date field back to a `Date`.
 *
 * For write paths doing their own arithmetic or formatting — day counts,
 * DD/MM/YYYY, epoch maths — where a `Date | 'YYYY-MM-DD'` union is awkward. A
 * calendar date resolves to its UTC midnight, so `getUTC*` accessors read back
 * the same calendar date that came in.
 *
 * Read paths should NOT use this to normalise the union away: the whole point
 * of the union is that a date-only source stays a date.
 */
export function toDate(val?: string | Date | null): Date | undefined {
  const iso = toIsoDateTime(val)
  return iso === undefined ? undefined : new Date(iso)
}

/**
 * Xero's `LineAmountTypes` says whether line amounts already include tax.
 *
 * `NoTax` maps to `null` rather than `false`: with no tax applied, inclusive
 * and exclusive give the same total, so claiming "exclusive" would assert a
 * distinction the document does not make. `null` says the question does not
 * arise, per the null-vs-empty rule.
 */
export function mapLineAmountTypes(v: unknown): boolean | null | undefined {
  if (typeof v !== 'string') return undefined
  switch (v.toLowerCase()) {
    case 'inclusive':
      return true
    case 'exclusive':
      return false
    case 'notax':
      return null
    default:
      return undefined
  }
}
