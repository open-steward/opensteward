/**
 * Bridge payout -> Payout.
 *
 * Fixture: the first `resources` entry of the ListPayouts example
 * (https://docs.bridgeapi.io/reference/listpayouts.md), verbatim.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawBridgeOpenBankingPayout,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const PAID: RawBridgeOpenBankingPayout = {
  id: '45bad960-7daa-40eb-a4c0-cbaf5be16e42',
  beneficiary: {
    id: '90da9c34-9baf-401d-8191-250841667fe6',
    iban: 'FR66XXXXXXXXXXXXXXXXXXXXC26',
    bic: 'SMOEFRP3',
    company_name: 'YourCompany',
  },
  status: 'paid',
  client_reference: 'ref-1234',
  label: 'Payout Bridge',
  amount: 20,
  currency: 'EUR',
  type: 'manual',
  created_at: '2024-12-04T16:16:41.287Z',
  updated_at: '2024-12-04T16:16:41.446Z',
}

describe('bridge-open-banking transformPayout', () => {
  it('maps the documented example', () => {
    const p = PayoutSchema.parse(transformPayout(PAID))
    expect(p.id).toBe('45bad960-7daa-40eb-a4c0-cbaf5be16e42')
    expect(p.externalId).toBe(p.id)
    expect(p.amount).toBe(2000)
    expect(p.currency).toBe('EUR')
    expect(p.status).toBe('paid')
    expect(p.statementDescriptor).toBe('Payout Bridge')
    expect(p.gateway).toBe('bridge-open-banking')
    expect(p.metadata).toEqual({
      client_reference: 'ref-1234',
      type: 'manual',
      beneficiary_id: '90da9c34-9baf-401d-8191-250841667fe6',
      bridge_status: 'paid',
    })
    expect(p.createdAt).toBe('2024-12-04T16:16:41.287Z')
    expect(p.updatedAt).toBe('2024-12-04T16:16:41.446Z')
  })

  it.each([
    ['unknown', 'unknown'],
    ['created', 'pending'],
    ['processing', 'pending'],
    ['execution_skipped', 'unknown'],
    ['in_transit', 'in_transit'],
    ['paid', 'paid'],
    ['recalled', 'unknown'],
    ['canceled', 'cancelled'],
    ['rejected', 'failed'],
    ['failed', 'failed'],
  ])('maps status %s to %s', (bridge, canonical) => {
    expect(PayoutSchema.parse(transformPayout({ ...PAID, status: bridge })).status).toBe(canonical)
  })

  it('omits the statement descriptor when there is no label', () => {
    const p = PayoutSchema.parse(transformPayout({ ...PAID, label: undefined }))
    expect(p.statementDescriptor).toBeUndefined()
  })

  it('upper-cases the currency code', () => {
    expect(PayoutSchema.parse(transformPayout({ ...PAID, currency: 'eur' })).currency).toBe('EUR')
  })

  it('throws rather than inventing a currency or amount', () => {
    expect(() => transformPayout({ ...PAID, currency: undefined })).toThrow(/no currency/)
    expect(() => transformPayout({ ...PAID, amount: undefined })).toThrow(/no amount/)
  })
})
