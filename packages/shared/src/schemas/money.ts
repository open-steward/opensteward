/**
 * Currency-aware conversion between major units (what almost every vendor API
 * sends and expects: `19.99`) and the integer minor units canonical `Amount`
 * fields require (`1999`).
 *
 * This lives in shared because eight of the nine verticals had no such helper
 * and hardcoded `* 100` / `/ 100` instead — 157 call sites across 122 files.
 * That is correct for the ~95% of ISO-4217 currencies with two fractional
 * digits and silently wrong for the rest: JPY and KRW have none, so ¥1000 is
 * 1000 minor units and `* 100` reports ¥100,000; BHD and KWD have three, so
 * `* 100` reports a tenth of the real amount. `Iso4217Currency` is
 * regex-based, so nothing stops those codes reaching any adapter.
 *
 * Passing no currency keeps the two-digit assumption, which is what makes this
 * a drop-in for existing call sites: the behaviour only changes once a caller
 * supplies the currency it already has.
 */

/** ISO 4217 codes whose minor unit is not 1/100. Everything else is 2. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  XOF: 0,
  XAF: 0,
  PYG: 0,
  UGX: 0,
  RWF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  JOD: 3,
  IQD: 3,
  LYD: 3,
}

/** Fractional digits for a currency; 2 when unknown or unstated. */
export function minorUnitExponent(currency?: string | null): number {
  if (!currency) return 2
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2
}

/**
 * Major-unit decimal to integer minor units (`19.99` USD → `1999`,
 * `1000` JPY → `1000`, `1.999` KWD → `1999`).
 *
 * Returns undefined for null/undefined/non-finite input, so the
 * null / explicit-zero / omitted distinction `Amount` documents survives.
 */
export function majorToMinor(value: number, currency?: string | null): number
export function majorToMinor(value: null | undefined, currency?: string | null): undefined
export function majorToMinor(
  value: number | null | undefined,
  currency?: string | null,
): number | undefined
export function majorToMinor(
  value: number | null | undefined,
  currency?: string | null,
): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  return Math.round(value * 10 ** minorUnitExponent(currency))
}

/**
 * The inverse, for write paths: integer minor units back to the major-unit
 * decimal a vendor expects (`1999` → `19.99` EUR, `1999` JPY, `1.999` KWD).
 *
 * Getting this wrong is worse than getting the read wrong: a read reports a
 * bad number, a write persists one on the customer's own records.
 */
export function minorToMajor(
  value: number | null | undefined,
  currency?: string | null,
): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  const exponent = minorUnitExponent(currency)
  if (exponent === 0) return value
  return value / 10 ** exponent
}
