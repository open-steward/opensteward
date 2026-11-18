import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawXenditPaymentRequest,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('xendit transformCharge', () => {
  it('maps SUCCEEDED status to "succeeded" and sets captured/amountCaptured', () => {
    const raw: RawXenditPaymentRequest = {
      id: 'pr-001',
      reference_id: 'ref-001',
      customer_id: 'cust-1',
      amount: 50000,
      currency: 'PHP',
      status: 'SUCCEEDED',
      capture_amount: 50000,
      description: 'Test charge',
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('PHP')
    expect(result.captured).toBe(true)
    expect(result.amountCaptured).toBe(50000)
    expect(result.gateway).toBe('xendit')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED status to "failed"', () => {
    const raw: RawXenditPaymentRequest = {
      id: 'pr-002',
      amount: 10000,
      currency: 'IDR',
      status: 'FAILED',
      failure_code: 'INSUFFICIENT_BALANCE',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('INSUFFICIENT_BALANCE')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps VOIDED status to "cancelled"', () => {
    const raw: RawXenditPaymentRequest = {
      id: 'pr-003',
      amount: 25000,
      currency: 'IDR',
      status: 'VOIDED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING/REQUIRES_ACTION to "pending"', () => {
    const raw: RawXenditPaymentRequest = {
      id: 'pr-004',
      amount: 15000,
      currency: 'IDR',
      status: 'REQUIRES_ACTION',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
