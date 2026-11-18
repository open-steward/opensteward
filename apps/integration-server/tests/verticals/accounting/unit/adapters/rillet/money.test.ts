import { describe, it, expect } from 'vitest'
import {
  minorToRilletAmount,
  rilletAmountToMinor,
} from '../../../../../../src/verticals/accounting/adapters/rillet/money'

describe('rilletAmountToMinor', () => {
  it.each([
    ['12.50', 'USD', 1250],
    ['1000', 'JPY', 1000],
    ['1.500', 'KWD', 1500],
    ['0.125', 'BHD', 125],
  ])('reads %s %s as %d minor units', (amount, currency, expected) => {
    expect(rilletAmountToMinor({ amount, currency })).toBe(expected)
  })

  it('returns undefined for a missing amount', () => {
    expect(rilletAmountToMinor(undefined)).toBeUndefined()
  })
})

describe('minorToRilletAmount', () => {
  it.each([
    [1250, 'USD', '12.50'],
    [1000, 'JPY', '1000'],
    [1500, 'KWD', '1.500'],
    [125, 'BHD', '0.125'],
  ])('writes %d %s minor units as "%s", rounded to the currency', (minor, currency, expected) => {
    expect(minorToRilletAmount(minor, currency)).toEqual({ amount: expected, currency })
  })

  it('round-trips through the read', () => {
    for (const currency of ['USD', 'JPY', 'KWD']) {
      expect(rilletAmountToMinor(minorToRilletAmount(12345, currency))).toBe(12345)
    }
  })

  it('returns undefined for a missing amount', () => {
    expect(minorToRilletAmount(undefined, 'USD')).toBeUndefined()
  })
})
