import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawMoyasarPayout,
} from '../../../../../../../src/verticals/payments/adapters/moyasar/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('moyasar transformPayout', () => {
  it('maps id, amount (safeInt), currency (upper-cased), and status "paid"', () => {
    const raw: RawMoyasarPayout = {
      id: 'po-moyas-001',
      amount: 5000,
      currency: 'sar',
      status: 'paid',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('po-moyas-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('SAR')
    expect(result.status).toBe('paid')
    expect(result.gateway).toBe('moyasar')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "initiated" to "in_transit"', () => {
    const raw: RawMoyasarPayout = {
      id: 'po-moyas-002',
      amount: 2000,
      currency: 'SAR',
      status: 'initiated',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" correctly', () => {
    const raw: RawMoyasarPayout = {
      id: 'po-moyas-003',
      amount: 1000,
      currency: 'SAR',
      status: 'failed',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
