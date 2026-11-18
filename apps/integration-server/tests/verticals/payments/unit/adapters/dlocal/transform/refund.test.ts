import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawDLocalRefund,
} from '../../../../../../../src/verticals/payments/adapters/dlocal/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('dlocal transformRefund', () => {
  it('maps a SUCCESS refund to status "succeeded" with chargeId and amount', () => {
    const raw: RawDLocalRefund = {
      id: 'ref-001',
      payment_id: 'pay-001',
      amount: 49.99,
      currency: 'USD',
      status: 'SUCCESS',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.chargeId).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('dlocal')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a non-SUCCESS refund to status "pending"', () => {
    const raw: RawDLocalRefund = {
      id: 'ref-002',
      payment_id: 'pay-002',
      amount: 100,
      currency: 'BRL',
      status: 'PENDING',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('BRL')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('includes status_code and status_message in metadata', () => {
    const raw: RawDLocalRefund = {
      id: 'ref-003',
      payment_id: 'pay-003',
      amount: 25,
      currency: 'USD',
      status: 'SUCCESS',
      status_code: 'OK',
      status_message: 'Refund processed',
      created_date: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.metadata?.status_code).toBe('OK')
    expect(result.metadata?.status_message).toBe('Refund processed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
