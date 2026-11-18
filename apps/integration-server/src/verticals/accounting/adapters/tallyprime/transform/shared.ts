/**
 * Shared parsing helpers for TallyPrime's XML export shapes.
 *
 * Named `shared.ts` deliberately: `check:transform-schema-assertions` excludes
 * helper modules on that basename, because no `<Resource>Schema` exists for
 * them to assert against.
 */

/**
 * Parse a TallyPrime `<DATE>` value.
 *
 * Tally emits `YYYYMMDD` with no separators — "All dates must follow the
 * YYYYMMDD format", per Tally's own XML documentation, and the same form is
 * required on import. JavaScript cannot parse that:
 *
 *     new Date('20260915')   -> Invalid Date
 *     new Date('2026-09-15') -> 2026-09-15T00:00:00.000Z
 *
 * Every transform here did `new Date(raw.DATE)` and then guarded with
 * `isNaN(getTime())`, so an unparseable date became `undefined` rather than an
 * error. The guard is what made it silent: every voucher date was dropped and
 * nothing failed.
 *
 * The compact form is tried first because it is the documented one. Other
 * shapes fall through to `Date` so a gateway or TDL variant that emits
 * `2026-09-15` or `15-Sep-2026` still works.
 *
 * A date-only value is anchored at UTC midnight, not local midnight. Tally
 * reports a calendar date — the day a voucher is posted — and reading it in
 * local time moves it to the previous day for every deployment west of UTC,
 * a class of bug that is invisible on a UTC CI box and appears in production.
 */
export function parseTallyDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const raw = value.trim()
  if (!raw) return undefined

  // The documented form: exactly eight digits, YYYYMMDD.
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
  if (compact) {
    const [, y, m, d] = compact
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const parsed = new Date(Date.UTC(year, month - 1, day))
    // Rejects real-looking but impossible dates (20260230) rather than letting
    // Date roll them into the next month.
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return undefined
    }
    return parsed
  }

  // A bare ISO calendar date is already UTC per the spec; anything else is
  // left to Date, which is the pre-existing behaviour for non-compact values.
  const parsed = new Date(raw)
  return isNaN(parsed.getTime()) ? undefined : parsed
}
