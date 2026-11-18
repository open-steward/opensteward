import { describe, it, expect } from 'vitest'
import {
  amountToMinor,
  stringMap,
} from '../../../../../../../src/verticals/payments/adapters/tink/transform/shared'
import { MoneySchema } from '../../../../../../../src/verticals/payments/schema/shared'

const amt = (currencyCode: string | undefined, scale: string, unscaledValue: string) => ({
  currencyCode,
  value: { scale, unscaledValue },
})

describe('tink amountToMinor (ExactNumber: "unscaledValue * (10^-scale)")', () => {
  it('reads the documented example: scale 1, unscaledValue 1230 is 123.0', () => {
    // 123.0 GBP = 12300 pence
    expect(MoneySchema.parse(amountToMinor(amt('GBP', '1', '1230'), 'x'))).toEqual({
      amount: 12300,
      currency: 'GBP',
    })
  })

  it('scales to the currency minor unit (JPY has none, KWD has three)', () => {
    expect(amountToMinor(amt('JPY', '0', '500'), 'x').amount).toBe(500)
    expect(amountToMinor(amt('KWD', '2', '1234'), 'x').amount).toBe(12340)
  })

  it('divides exactly when the scale exceeds the minor unit', () => {
    expect(amountToMinor(amt('EUR', '4', '123400'), 'x').amount).toBe(1234)
  })

  it('throws rather than rounding a value finer than the minor unit', () => {
    expect(() => amountToMinor(amt('EUR', '3', '1235'), 'x')).toThrow(/finer/)
  })

  it('upper-cases the currency and never defaults one', () => {
    expect(amountToMinor(amt('gbp', '2', '1'), 'x').currency).toBe('GBP')
    expect(() => amountToMinor(amt(undefined, '2', '1'), 'x')).toThrow(/currencyCode/)
    expect(() => amountToMinor(undefined, 'x')).toThrow(/currencyCode/)
  })

  it('throws on a non-integer unscaledValue', () => {
    expect(() => amountToMinor(amt('GBP', '2', '12.5'), 'x')).toThrow(/unscaledValue/)
  })

  it('names the missing field when scale is absent', () => {
    expect(() =>
      amountToMinor({ currencyCode: 'GBP', value: { unscaledValue: '100' } }, 'x'),
    ).toThrow(/unscaledValue\/scale/)
  })

  it('throws rather than losing precision past Number.MAX_SAFE_INTEGER', () => {
    expect(() => amountToMinor(amt('GBP', '2', '9007199254740993'), 'x')).toThrow(/safe integer/)
    expect(() => amountToMinor(amt('GBP', '2', '-9007199254740993'), 'x')).toThrow(/safe integer/)
    expect(amountToMinor(amt('GBP', '2', '9007199254740991'), 'x').amount).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })
})

describe('tink stringMap', () => {
  it('keeps string values and drops objects', () => {
    expect(stringMap({ a: 'x', b: 2, c: { d: 1 }, e: null })).toEqual({ a: 'x', b: '2' })
  })
})
