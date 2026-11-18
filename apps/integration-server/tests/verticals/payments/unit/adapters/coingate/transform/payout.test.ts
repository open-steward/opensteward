import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawCoingateSend,
} from '../../../../../../../src/verticals/payments/adapters/coingate/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('coingate transformPayout', () => {
  it('maps a "completed" send request to status "paid"', () => {
    const raw: RawCoingateSend = {
      id: 77,
      status: 'completed',
      balance_debit_amount: '250.00',
      balance_debit_currency: 'EUR',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('77')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(25000)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('coingate')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps "in_progress" to status "in_transit"', () => {
    const raw: RawCoingateSend = {
      id: 78,
      status: 'in_progress',
      balance_debit_amount: '100.00',
      balance_debit_currency: { symbol: 'BTC' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.currency).toBe('BTC')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" to status "failed"', () => {
    const raw: RawCoingateSend = {
      id: 79,
      status: 'failed',
      input_amount: '50.00',
      input_currency: 'EUR',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps "canceled" to status "cancelled"', () => {
    const raw: RawCoingateSend = {
      id: 80,
      status: 'canceled',
      input_amount: '25.00',
      input_currency: 'USD',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to input_amount/input_currency when balance_debit fields absent', () => {
    const raw: RawCoingateSend = {
      id: 81,
      status: 'completed',
      input_amount: '75.00',
      input_currency: 'EUR',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.amount).toBe(7500)
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
