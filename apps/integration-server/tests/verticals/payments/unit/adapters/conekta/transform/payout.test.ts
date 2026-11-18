import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawConektaPayoutOrder,
} from '../../../../../../../src/verticals/payments/adapters/conekta/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('conekta transformPayout', () => {
  it('maps a paid payout order to status "paid" with correct amount', () => {
    const raw: RawConektaPayoutOrder = {
      id: 'po-001',
      amount: 5000,
      currency: 'MXN',
      status: 'paid',
      reason: 'Seller payout',
      created_at: 1709251200,
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('MXN')
    expect(result.statementDescriptor).toBe('Seller payout')
    expect(result.gateway).toBe('conekta')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps an in_progress payout order to status "in_transit"', () => {
    const raw: RawConektaPayoutOrder = {
      id: 'po-002',
      amount: 2000,
      currency: 'MXN',
      status: 'in_progress',
      created_at: 1709251200,
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled payout order to status "cancelled"', () => {
    const raw: RawConektaPayoutOrder = {
      id: 'po-003',
      amount: 1000,
      currency: 'MXN',
      status: 'canceled',
      created_at: 1709251200,
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
