import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBamboraReturn,
} from '../../../../../../../src/verticals/payments/adapters/bambora/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('bambora transformRefund', () => {
  it('maps an approved return to status "succeeded"', () => {
    const raw: RawBamboraReturn = {
      id: 20000001,
      approved: '1',
      type: 'R',
      amount: '25.00',
      currency: 'CAD',
      created: '2024-03-01T00:00:00',
      original_transaction: 10000001,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('20000001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('CAD')
    expect(result.chargeId).toBe('10000001')
    expect(result.gateway).toBe('bambora')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a declined return to status "failed"', () => {
    const raw: RawBamboraReturn = {
      id: 20000002,
      approved: '0',
      type: 'R',
      amount: '10.00',
      currency: 'CAD',
      message: 'Return declined',
      created: '2024-03-01T00:00:00',
      original_transaction: 10000002,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Return declined')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses caller-supplied chargeId over original_transaction', () => {
    const raw: RawBamboraReturn = {
      id: 20000003,
      approved: '1',
      type: 'R',
      amount: '5.00',
      currency: 'CAD',
      original_transaction: 99999,
    }
    const result = transformRefund(raw, 'override-charge-id')
    expect(result.chargeId).toBe('override-charge-id')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('converts major-unit decimal to minor units', () => {
    const raw: RawBamboraReturn = {
      id: 20000004,
      approved: '1',
      type: 'R',
      amount: '99.99',
      currency: 'CAD',
      original_transaction: 10000004,
    }
    const result = transformRefund(raw)
    expect(result.amount).toBe(9999)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
