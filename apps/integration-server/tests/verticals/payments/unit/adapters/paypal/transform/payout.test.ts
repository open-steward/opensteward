import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawPayPalPayoutItem,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('paypal transformPayout', () => {
  it('maps a SUCCESS payout to status "paid"', () => {
    const raw: RawPayPalPayoutItem = {
      payout_item_id: 'PYT-001',
      transaction_status: 'SUCCESS',
      payout_item: {
        amount: { value: '250.00', currency_code: 'USD' },
      },
      time_processed: '2024-05-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('PYT-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(25000)
    expect(result.currency).toBe('USD')
    expect(result.arrivalDate).toBe('2024-05-01T00:00:00Z')
    expect(result.gateway).toBe('paypal')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps UNCLAIMED status to "in_transit"', () => {
    const raw: RawPayPalPayoutItem = {
      payout_item_id: 'PYT-002',
      transaction_status: 'UNCLAIMED',
      payout_item: {
        amount: { value: '50.00', currency_code: 'EUR' },
      },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED status to "failed"', () => {
    const raw: RawPayPalPayoutItem = {
      payout_item_id: 'PYT-003',
      transaction_status: 'FAILED',
      payout_item: { amount: { value: '10.00', currency_code: 'GBP' } },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
