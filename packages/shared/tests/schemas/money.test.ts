import { describe, it, expect } from 'vitest'
import { majorToMinor, minorToMajor, minorUnitExponent } from '../../src/schemas/money'

/**
 * Eight of the nine verticals had no currency-aware money helper and hardcoded
 * `* 100` / `/ 100` instead — 157 call sites across 122 files, including
 * accounting's own `toMinorUnits`, which Xero and most of the vertical use.
 *
 * That is right for the ~95% of ISO-4217 currencies with two fractional digits
 * and silently wrong for the rest. `Iso4217Currency` is regex-based, so
 * nothing stops JPY or KWD reaching any adapter, and accounting already maps
 * JPY (invoice-ninja's currency table).
 */

describe('minorUnitExponent', () => {
  it('defaults to 2 for an unknown or unstated currency', () => {
    expect(minorUnitExponent(undefined)).toBe(2)
    expect(minorUnitExponent('USD')).toBe(2)
    expect(minorUnitExponent('ZZZ')).toBe(2)
  })

  it('knows the zero- and three-digit currencies', () => {
    expect(minorUnitExponent('JPY')).toBe(0)
    expect(minorUnitExponent('KRW')).toBe(0)
    expect(minorUnitExponent('KWD')).toBe(3)
    expect(minorUnitExponent('BHD')).toBe(3)
  })

  it('is case-insensitive, since vendors send both', () => {
    expect(minorUnitExponent('jpy')).toBe(0)
  })
})

describe('majorToMinor', () => {
  it('scales a two-digit currency', () => {
    expect(majorToMinor(19.99, 'USD')).toBe(1999)
  })

  it('leaves a zero-digit currency alone', () => {
    // The bug the hardcoded *100 produces: ¥1000 reported as ¥100,000.
    expect(majorToMinor(1000, 'JPY')).toBe(1000)
  })

  it('scales a three-digit currency by 1000', () => {
    // The hardcoded *100 reports a tenth of the real amount here.
    expect(majorToMinor(1.999, 'KWD')).toBe(1999)
  })

  it('keeps the two-digit assumption when no currency is given', () => {
    // What makes this a drop-in for existing call sites.
    expect(majorToMinor(19.99)).toBe(1999)
  })

  it('rounds rather than truncating', () => {
    expect(majorToMinor(0.005, 'USD')).toBe(1)
    expect(majorToMinor(19.994, 'USD')).toBe(1999)
  })

  it('returns undefined for absent or non-finite input', () => {
    expect(majorToMinor(null)).toBeUndefined()
    expect(majorToMinor(undefined)).toBeUndefined()
    expect(majorToMinor(Number.NaN)).toBeUndefined()
    expect(majorToMinor(Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  it('preserves an explicit zero, which is not the same as absent', () => {
    expect(majorToMinor(0, 'USD')).toBe(0)
  })
})

describe('minorToMajor', () => {
  it('is the inverse for each exponent', () => {
    expect(minorToMajor(1999, 'USD')).toBe(19.99)
    expect(minorToMajor(1000, 'JPY')).toBe(1000)
    expect(minorToMajor(1999, 'KWD')).toBe(1.999)
  })

  it('round-trips every exponent without drift', () => {
    // A write path that does not invert its read path exactly is how a
    // customer's own record ends up 100x out.
    for (const [amount, currency] of [
      [19.99, 'USD'],
      [1000, 'JPY'],
      [1.999, 'KWD'],
      [0, 'EUR'],
    ] as Array<[number, string]>) {
      expect(minorToMajor(majorToMinor(amount, currency), currency)).toBe(amount)
    }
  })

  it('returns undefined for absent or non-finite input', () => {
    expect(minorToMajor(null)).toBeUndefined()
    expect(minorToMajor(Number.NaN)).toBeUndefined()
  })
})
