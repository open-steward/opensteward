import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawFinixReversal,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('finix transformRefund', () => {
  it('maps a SUCCEEDED reversal to status "succeeded"', () => {
    const raw: RawFinixReversal = {
      id: 'TRr1',
      type: 'REVERSAL',
      state: 'SUCCEEDED',
      amount: 2000,
      currency: 'USD',
      parent_transfer: 'TRf1',
      trace_id: 'trace-rev-1',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('TRr1')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('USD')
    expect(result.chargeId).toBe('TRf1')
    expect(result.gateway).toBe('finix')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING reversal to status "pending"', () => {
    const raw: RawFinixReversal = {
      id: 'TRr2',
      state: 'PENDING',
      amount: 500,
      currency: 'USD',
      parent_transfer: 'TRf2',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('TRf2')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED reversal to status "failed" with failure reason', () => {
    const raw: RawFinixReversal = {
      id: 'TRr3',
      state: 'FAILED',
      amount: 1000,
      currency: 'USD',
      parent_transfer: 'TRf3',
      failure_code: 'PROCESSING_ERROR',
      failure_message: 'Reversal could not be processed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Reversal could not be processed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED reversal to status "cancelled"', () => {
    const raw: RawFinixReversal = {
      id: 'TRr4',
      state: 'CANCELED',
      amount: 300,
      currency: 'USD',
      parent_transfer: 'TRf4',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('stores trace_id in metadata', () => {
    const raw: RawFinixReversal = {
      id: 'TRr5',
      state: 'SUCCEEDED',
      amount: 800,
      currency: 'USD',
      parent_transfer: 'TRf5',
      trace_id: 'trace-xyz',
      parent_transfer_trace_id: 'trace-parent',
    }
    const result = transformRefund(raw)
    expect(result.metadata['trace_id']).toBe('trace-xyz')
    expect(result.metadata['parent_transfer_trace_id']).toBe('trace-parent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
