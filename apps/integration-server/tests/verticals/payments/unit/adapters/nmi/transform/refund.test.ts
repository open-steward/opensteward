import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawNmiRefund,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('nmi transformRefund', () => {
  it('maps response "1" to status "succeeded"', () => {
    const raw: RawNmiRefund = {
      transactionId: 'ref-001',
      chargeId: 'txn-001',
      response: '1',
      amount: '25.00',
      currency: 'USD',
      date: '20240301000000',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.externalId).toBe('ref-001')
    expect(result.chargeId).toBe('txn-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.failureReason).toBeUndefined()
    expect(result.gateway).toBe('nmi')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps response "2" (declined) to status "failed" with failureReason', () => {
    const raw: RawNmiRefund = {
      transactionId: 'ref-002',
      chargeId: 'txn-002',
      response: '2',
      responseText: 'Refund declined',
      responseCode: '300',
      amount: '10.00',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund declined')
    expect(result.metadata['response_code']).toBe('300')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps response "3" (error) to status "failed"', () => {
    const raw: RawNmiRefund = {
      transactionId: 'ref-003',
      chargeId: 'txn-003',
      response: '3',
      responseText: 'Processing error',
      amount: '5.00',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Processing error')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps absent response to status "pending"', () => {
    const raw: RawNmiRefund = {
      transactionId: 'ref-004',
      chargeId: 'txn-004',
      amount: '15.00',
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawNmiRefund = {
      transactionId: 'ref-005',
      chargeId: 'txn-005',
      response: '1',
      amount: '8.00',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
