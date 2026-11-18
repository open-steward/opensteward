import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawDLocalPayout,
} from '../../../../../../../src/verticals/payments/adapters/dlocal/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('dlocal transformPayout', () => {
  it('maps a PAID payout to status "paid" with correct amount and currency', () => {
    const raw: RawDLocalPayout = {
      id: 'dlo-pay-001',
      status: 'PAID',
      amount: 150.5,
      currency: 'USD',
      payout_method: 'BANK_TRANSFER',
      beneficiary: { name: 'Alice Smith', document: '12345678' },
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('dlo-pay-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(15050)
    expect(result.currency).toBe('USD')
    expect(result.statementDescriptor).toBe('Alice Smith')
    expect(result.gateway).toBe('dlocal')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PROCESSING payout to status "in_transit"', () => {
    const raw: RawDLocalPayout = {
      id: 'dlo-pay-002',
      status: 'PROCESSING',
      amount: 200,
      currency: 'BRL',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.currency).toBe('BRL')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a REJECTED payout to status "failed"', () => {
    const raw: RawDLocalPayout = {
      id: 'dlo-pay-003',
      status: 'REJECTED',
      amount: 50,
      currency: 'USD',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
