import { describe, it, expect } from 'vitest'
import { moneyToMinor } from '../../../../../../src/verticals/payments/adapters/stitch/money'

describe('stitch moneyToMinor', () => {
  it('scales by the currency exponent, not a fixed 100', () => {
    expect(moneyToMinor({ quantity: '118.68', currency: 'ZAR' }, 'x')).toEqual({
      amount: 11868,
      currency: 'ZAR',
    })
    expect(moneyToMinor({ quantity: 1, currency: 'zar' }, 'x')).toEqual({
      amount: 100,
      currency: 'ZAR',
    })
    expect(moneyToMinor({ quantity: '1000', currency: 'JPY' }, 'x')).toEqual({
      amount: 1000,
      currency: 'JPY',
    })
  })
  it('throws on a missing quantity or currency', () => {
    expect(() => moneyToMinor(undefined, 'x')).toThrow()
    expect(() => moneyToMinor({ quantity: '1', currency: '' }, 'x')).toThrow()
  })
})
