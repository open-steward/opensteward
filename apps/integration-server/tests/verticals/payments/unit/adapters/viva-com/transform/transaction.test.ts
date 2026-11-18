import { describe, it, expect } from 'vitest'
import {
  CHARGE_TYPE_IDS,
  REFUND_TYPE_IDS,
  currencyOf,
} from '../../../../../../../src/verticals/payments/adapters/viva-com/transform/transaction'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/viva-com/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { documentedTransaction } from '../fixture'

describe('viva-com transaction helpers', () => {
  it('currencyOf maps the documented example CurrencyCode 978 to EUR', () => {
    expect(currencyOf(documentedTransaction())).toBe('EUR')
    expect(ChargeSchema.parse(transformCharge(documentedTransaction())).currency).toBe('EUR')
  })

  it('currencyOf refuses a code outside Viva’s documented table', () => {
    expect(() => currencyOf(documentedTransaction({ CurrencyCode: 840 }))).toThrow(/840/)
  })

  it('charge and refund type ids never overlap, and leave out pre-auths and claims', () => {
    for (const id of CHARGE_TYPE_IDS) expect(REFUND_TYPE_IDS).not.toContain(id)
    for (const excluded of [1, 80, 8, 13, 46, 83, 90]) {
      expect(CHARGE_TYPE_IDS).not.toContain(excluded)
      expect(REFUND_TYPE_IDS).not.toContain(excluded)
    }
    expect(CHARGE_TYPE_IDS).toContain(5)
    expect(REFUND_TYPE_IDS).toContain(4)
  })

  // Pinned row by row against the TransactionTypeId table at
  // https://developer.viva.com/integration-reference/response-codes/ .
  it('pins the charge type ids', () => {
    expect([...CHARGE_TYPE_IDS]).toEqual([
      0, 5, 6, 9, 15, 16, 20, 23, 25, 27, 29, 32, 34, 36, 38, 40, 44, 48, 50, 52, 54, 56, 60, 62,
      64, 66, 68, 70, 72, 74, 76, 78, 81, 88,
    ])
  })

  it('pins the refund type ids', () => {
    expect([...REFUND_TYPE_IDS]).toEqual([
      4, 11, 17, 18, 21, 24, 26, 28, 30, 35, 37, 39, 41, 45, 49, 51, 53, 55, 57, 61, 63, 65, 67, 71,
      73, 75, 77, 79, 85, 89,
    ])
  })
})
