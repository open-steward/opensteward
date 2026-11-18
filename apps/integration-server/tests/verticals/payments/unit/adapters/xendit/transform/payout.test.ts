import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawXenditPayout,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('xendit transformPayout', () => {
  it('maps SUCCEEDED status to "paid" and extracts destinationLast4', () => {
    const raw: RawXenditPayout = {
      id: 'po-001',
      reference_id: 'ref-001',
      channel_code: 'BCA',
      channel_properties: {
        account_number: '1234005678',
        account_holder_name: 'Jane Doe',
      },
      amount: 100000,
      currency: 'IDR',
      status: 'SUCCEEDED',
      estimated_arrival_time: '2024-03-01T00:00:00Z',
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('IDR')
    expect(result.destinationLast4).toBe('5678')
    expect(result.gateway).toBe('xendit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING status to "pending"', () => {
    const raw: RawXenditPayout = {
      id: 'po-002',
      amount: 50000,
      currency: 'PHP',
      status: 'PENDING',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps REVERSED status to "cancelled"', () => {
    const raw: RawXenditPayout = {
      id: 'po-003',
      amount: 25000,
      currency: 'IDR',
      status: 'REVERSED',
      failure_code: 'ACCOUNT_CLOSED',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(result.failureCode).toBe('ACCOUNT_CLOSED')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED status to "failed"', () => {
    const raw: RawXenditPayout = {
      id: 'po-004',
      amount: 10000,
      currency: 'IDR',
      status: 'FAILED',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
