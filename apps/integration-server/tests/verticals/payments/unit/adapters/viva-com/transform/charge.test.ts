import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/viva-com/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { documentedTransaction } from '../fixture'

describe('viva-com transformCharge', () => {
  it('maps the documented example transaction', () => {
    const result = ChargeSchema.parse(transformCharge(documentedTransaction()))
    expect(result.id).toBe('e4c37c00-76ad-4730-93c2-004091ae9de1')
    expect(result.externalId).toBe('e4c37c00-76ad-4730-93c2-004091ae9de1')
    expect(result.amount).toBe(27)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.createdAt).toBe('2024-06-21T09:37:35.577Z')
    expect(result.metadata).toEqual({ orderCode: '4173124907236419' })
    expect(result.gateway).toBe('viva-com')
    expect(result.receiptEmail).toBeUndefined()
  })

  it('reads CustomerTrns, Email and MerchantTrns', () => {
    const result = ChargeSchema.parse(
      transformCharge(
        documentedTransaction({
          CustomerTrns: 'Two coffees',
          Email: 'jane@example.com',
          MerchantTrns: 'INV-7',
        }),
      ),
    )
    expect(result.description).toBe('Two coffees')
    expect(result.receiptEmail).toBe('jane@example.com')
    expect(result.metadata.merchantTrns).toBe('INV-7')
  })

  it('maps each documented currency code', () => {
    const table: Array<[number, string, number, number]> = [
      [826, 'GBP', 12.5, 1250],
      [946, 'RON', 1, 100],
      [985, 'PLN', 1, 100],
      [203, 'CZK', 1, 100],
      [348, 'HUF', 1, 100],
      [752, 'SEK', 1, 100],
      [208, 'DKK', 1, 100],
    ]
    for (const [numeric, alpha, major, minor] of table) {
      const r = ChargeSchema.parse(
        transformCharge(documentedTransaction({ CurrencyCode: numeric, Amount: major })),
      )
      expect(r.currency).toBe(alpha)
      expect(r.amount).toBe(minor)
    }
  })

  it('maps the documented StatusId values', () => {
    const table: Array<[string, string]> = [
      ['F', 'succeeded'],
      ['E', 'failed'],
      ['A', 'pending'],
      ['X', 'cancelled'],
      ['M', 'disputed'],
      ['MA', 'disputed'],
      ['MI', 'disputed'],
      ['ML', 'disputed'],
      ['MW', 'disputed'],
      ['MS', 'disputed'],
      ['R', 'unknown'],
    ]
    for (const [statusId, status] of table) {
      const r = ChargeSchema.parse(transformCharge(documentedTransaction({ StatusId: statusId })))
      expect(r.status).toBe(status)
    }
  })

  it('throws on a currency code Viva does not document, instead of guessing one', () => {
    expect(() => transformCharge(documentedTransaction({ CurrencyCode: 840 }))).toThrow(
      /CurrencyCode 840/,
    )
    expect(() => transformCharge(documentedTransaction({ CurrencyCode: null }))).toThrow(
      /CurrencyCode/,
    )
  })

  it('throws when Amount is missing, instead of reporting zero', () => {
    expect(() => transformCharge(documentedTransaction({ Amount: null }))).toThrow(/no Amount/)
  })
})
