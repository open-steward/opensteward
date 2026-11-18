import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawFinixSettlement,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('finix transformPayout', () => {
  it('maps a SUCCEEDED settlement to status "paid" using net_amount', () => {
    const raw: RawFinixSettlement = {
      id: 'SEi1',
      status: 'SUCCEEDED',
      total_amount: 10000,
      total_fee: 300,
      net_amount: 9700,
      currency: 'USD',
      destination: 'BAi1',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('SEi1')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(9700)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('finix')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a STAGED settlement to status "in_transit"', () => {
    const raw: RawFinixSettlement = {
      id: 'SEi2',
      status: 'STAGED',
      net_amount: 5000,
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.amount).toBe(5000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED settlement to status "failed"', () => {
    const raw: RawFinixSettlement = {
      id: 'SEi3',
      status: 'FAILED',
      net_amount: 0,
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to total_amount when net_amount is absent', () => {
    const raw: RawFinixSettlement = {
      id: 'SEi4',
      status: 'SUCCEEDED',
      total_amount: 8000,
      currency: 'USD',
    }
    const result = transformPayout(raw)
    expect(result.amount).toBe(8000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('stores total_fee and destination in metadata', () => {
    const raw: RawFinixSettlement = {
      id: 'SEi5',
      status: 'SUCCEEDED',
      net_amount: 4700,
      total_fee: 300,
      currency: 'USD',
      destination: 'BAi2',
    }
    const result = transformPayout(raw)
    expect(result.metadata['total_fee']).toBe('300')
    expect(result.metadata['destination']).toBe('BAi2')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
