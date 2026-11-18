import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  extractLatestRefund,
  type RawAsaasRefund,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('asaas transformRefund', () => {
  it('maps a DONE refund entry to succeeded', () => {
    const raw: RawAsaasRefund = {
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'DONE',
      value: 50.0,
      description: 'Customer request',
    }
    const result = transformRefund(raw, 'pay_001', 0)

    // id is synthesised: <chargeId>-refund-<index>
    expect(result.id).toBe('pay_001-refund-0')
    expect(result.chargeId).toBe('pay_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('BRL')
    expect(result.gateway).toBe('asaas')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED refund entry to cancelled', () => {
    const raw: RawAsaasRefund = {
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'CANCELLED',
      value: 25.0,
    }
    const result = transformRefund(raw, 'pay_002', 1)

    expect(result.id).toBe('pay_002-refund-1')
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund to pending status', () => {
    const raw: RawAsaasRefund = {
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'PENDING',
      value: 10.0,
    }
    const result = transformRefund(raw, 'pay_003')

    expect(result.status).toBe('pending')
    expect(result.id).toBe('pay_003-refund-0')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults index to 0 when not provided', () => {
    const raw: RawAsaasRefund = { status: 'DONE', value: 5.0 }
    const result = transformRefund(raw, 'pay_004')
    expect(result.id).toBe('pay_004-refund-0')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('asaas extractLatestRefund', () => {
  it('returns the last refund in the array with correct chargeId and index', () => {
    const payment = {
      id: 'pay_005',
      refunds: [
        { status: 'DONE', value: 20.0 },
        { status: 'DONE', value: 30.0 },
      ] as RawAsaasRefund[],
    }
    const extracted = extractLatestRefund(payment)

    expect(extracted).toBeDefined()
    expect(extracted!.chargeId).toBe('pay_005')
    expect(extracted!.index).toBe(1)
    expect(extracted!.refund.value).toBe(30.0)
  })

  it('returns undefined when refunds array is empty', () => {
    const payment = { id: 'pay_006', refunds: [] }
    expect(extractLatestRefund(payment)).toBeUndefined()
  })
})
