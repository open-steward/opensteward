import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawZipBnplCharge,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('zip-bnpl transformCharge', () => {
  it('maps amount, currency and gateway correctly', () => {
    const raw: RawZipBnplCharge = {
      id: 'zip-ch-001',
      amount: 4999,
      currency: 'usd',
      status: 'succeeded',
      customer_id: 'cus-abc',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('zip-ch-001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('zip-bnpl')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('picks customer_id and upcases currency from string amount', () => {
    const raw: RawZipBnplCharge = {
      id: 'zip-ch-002',
      amount: '1050',
      currency: 'eur',
      status: 'pending',
      customer_id: 'cus-xyz',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('cus-xyz')
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to customer field when customer_id absent', () => {
    const raw: RawZipBnplCharge = {
      id: 'zip-ch-003',
      amount: 200,
      currency: 'gbp',
      status: 'failed',
      customer: 'cus-fallback',
    }
    const result = transformCharge(raw)
    expect(result.customerId).toBe('cus-fallback')
    expect(result.currency).toBe('GBP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('rounds fractional amounts to integer', () => {
    const raw: RawZipBnplCharge = {
      id: 'zip-ch-004',
      amount: 99.9,
      currency: 'USD',
      status: 'succeeded',
    }
    const result = transformCharge(raw)
    expect(result.amount).toBe(100)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
