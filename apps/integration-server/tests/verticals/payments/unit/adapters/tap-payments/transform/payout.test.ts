import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawTapPayout,
} from '../../../../../../../src/verticals/payments/adapters/tap-payments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

/**
 * The first payout of the documented List All Payouts example response
 * (https://developers.tap.company/reference/list-payouts.md), with the
 * beneficiary of the retrieve example ("name": "John Doe") and a masked IBAN
 * shaped like the webhook-api example's ("iban": "XXXXX6275").
 */
function documentedPayout(): RawTapPayout {
  return {
    id: 'payout_xxxx',
    status: 'PAID_OUT',
    date: 1722781680000,
    amount: 300,
    currency: 'AED',
    merchant_id: '599242',
    wallet: {
      id: 'xxxx',
      legacy_id: 'xxxx',
      country: 'QA',
      bank: {
        id: 'xx',
        country: 'xx',
        name: 'xxxx',
        swift: 'xxxx',
        beneficiary: { name: 'John Doe', iban: 'XXXXX6275' },
      },
    },
    settlements_available: true,
    bank_reference: '',
  }
}

describe('tap-payments transformPayout', () => {
  it('maps the documented list example to the canonical payout', () => {
    const result = PayoutSchema.parse(transformPayout(documentedPayout()))
    expect(result).toMatchObject({
      id: 'payout_xxxx',
      externalId: 'payout_xxxx',
      amount: 30000,
      currency: 'AED',
      status: 'paid',
      arrivalDate: '2024-08-04T14:28:00.000Z',
      createdAt: '2024-08-04T14:28:00.000Z',
      destinationLast4: '6275',
      gateway: 'tap-payments',
    })
    expect(result.updatedAt).toBeUndefined()
    expect(result.metadata).toEqual({
      merchant_id: '599242',
      wallet_id: 'xxxx',
      bank_name: 'xxxx',
      bank_swift: 'xxxx',
      beneficiary_name: 'John Doe',
      settlements_available: 'true',
    })
  })

  it('scales a three-decimal KWD amount (webhook-api example) to fils', () => {
    const raw = { ...documentedPayout(), amount: 7351.874, currency: 'KWD' }
    const result = PayoutSchema.parse(transformPayout(raw))
    expect(result.amount).toBe(7351874)
    expect(result.currency).toBe('KWD')
  })

  it.each([
    ['PENDING', 'pending'],
    ['INITIATED', 'in_transit'],
    ['FAILED', 'failed'],
    ['PAID_OUT', 'paid'],
  ])('maps the documented status %s to %s', (status, expected) => {
    const result = PayoutSchema.parse(transformPayout({ ...documentedPayout(), status }))
    expect(result.status).toBe(expected)
  })

  it('maps an undocumented status to unknown, not a guessed state', () => {
    const result = PayoutSchema.parse(transformPayout({ ...documentedPayout(), status: 'OTHER' }))
    expect(result.status).toBe('unknown')
    const proto = PayoutSchema.parse(
      transformPayout({ ...documentedPayout(), status: 'constructor' }),
    )
    expect(proto.status).toBe('unknown')
  })

  it('passes the documented currency through as sent, without normalising it', () => {
    const result = transformPayout({ ...documentedPayout(), currency: 'kwd' })
    expect(result.currency).toBe('kwd')
  })

  it('omits destinationLast4 when the wallet carries no beneficiary IBAN', () => {
    const raw = { ...documentedPayout(), wallet: undefined }
    const result = PayoutSchema.parse(transformPayout(raw))
    expect(result.destinationLast4).toBeUndefined()
    expect(result.metadata.bank_name).toBeUndefined()
  })

  it('throws rather than inventing an id, currency or amount', () => {
    expect(() => transformPayout({ ...documentedPayout(), id: undefined })).toThrow(/id/)
    expect(() => transformPayout({ ...documentedPayout(), currency: undefined })).toThrow(
      /currency/,
    )
    expect(() => transformPayout({ ...documentedPayout(), currency: '' })).toThrow(/currency/)
    expect(() => transformPayout({ ...documentedPayout(), amount: undefined })).toThrow(/amount/)
  })
})
