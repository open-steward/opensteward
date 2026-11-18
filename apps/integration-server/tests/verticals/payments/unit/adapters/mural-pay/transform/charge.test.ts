/**
 * Fixture: a `Payin` built from the schema embedded in
 * https://developers.muralpay.com/reference/searchpayins.md, with the
 * documented `sourceAmount` example
 * { "currencySymbol": "USD", "exponent": 2, "type": "fiat", "value": "10000" }.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawMuralPayin,
} from '../../../../../../../src/verticals/payments/adapters/mural-pay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

function payin(over: Partial<RawMuralPayin> = {}): RawMuralPayin {
  return {
    id: '7f0c2a8e-4d3b-4a51-9f7e-1b2c3d4e5f60',
    destinationAccountId: '5d75e362-0812-4ea8-b203-c7c3a09f8473',
    payinRail: 'ACH',
    payinStatus: {
      type: 'completed',
      initiatedAt: '2025-04-05T04:24:03.862Z',
      completedAt: '2025-04-06T04:24:03.862Z',
      senderMetadata: { type: 'unknown' },
    },
    sourceAmount: { currencySymbol: 'USD', exponent: 2, type: 'fiat', value: '10000' },
    settlementStrategy: {},
    settlementDetails: {},
    fees: {},
    createdAt: '2025-04-05T04:24:03.862Z',
    updatedAt: '2025-04-06T04:24:03.862Z',
    ...over,
  }
}

describe('mural-pay transformCharge', () => {
  it('maps a completed fiat payin, parsing with ChargeSchema', () => {
    const out = ChargeSchema.parse(transformCharge(payin()))
    expect(out.id).toBe('7f0c2a8e-4d3b-4a51-9f7e-1b2c3d4e5f60')
    expect(out.externalId).toBe(out.id)
    // "10000" at exponent 2 is $100.00 = 10000 cents.
    expect(out.amount).toBe(10000)
    expect(out.currency).toBe('USD')
    expect(out.status).toBe('succeeded')
    expect(out.createdAt).toBe('2025-04-05T04:24:03.862Z')
    expect(out.updatedAt).toBe('2025-04-06T04:24:03.862Z')
    expect(out.gateway).toBe('mural-pay')
  })

  it('rescales a value whose exponent differs from the currency exponent', () => {
    const out = ChargeSchema.parse(
      transformCharge(
        payin({
          sourceAmount: { currencySymbol: 'MXN', exponent: 4, type: 'fiat', value: '1234500' },
        }),
      ),
    )
    // 123.45 MXN → 12345 minor units.
    expect(out.amount).toBe(12345)
    expect(out.currency).toBe('MXN')
  })

  it.each([
    ['created', 'pending'],
    ['pending', 'pending'],
    ['on-hold', 'pending'],
    ['canceled', 'cancelled'],
    ['refunded', 'refunded'],
    ['brandNew', 'unknown'],
  ])('maps payinStatus.type %s to %s', (type, expected) => {
    const out = ChargeSchema.parse(transformCharge(payin({ payinStatus: { type } })))
    expect(out.status).toBe(expected)
  })

  it('maps a failed payin with its reason', () => {
    const out = ChargeSchema.parse(
      transformCharge(
        payin({
          payinStatus: {
            type: 'failed',
            reason: 'Returned',
            initiatedAt: '2025-04-05T04:24:03.862Z',
          },
        }),
      ),
    )
    expect(out.status).toBe('failed')
    expect(out.failureMessage).toBe('Returned')
  })

  it('throws on a blockchain source amount rather than inventing a currency', () => {
    expect(() =>
      transformCharge(
        payin({
          sourceAmount: {
            type: 'blockchain',
            tokenSymbol: 'USDC',
            exponent: 6,
            value: '2500000',
            blockchain: 'TRON',
          },
        }),
      ),
    ).toThrow(/token, not an ISO 4217 currency/)
    try {
      transformCharge(
        payin({
          sourceAmount: {
            type: 'blockchain',
            tokenSymbol: 'USDC',
            exponent: 6,
            value: '2500000',
            blockchain: 'TRON',
          },
        }),
      )
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
  })
})
