import { describe, it, expect } from 'vitest'
import { transformDispute } from '../../../../../../../src/verticals/payments/adapters/intasend/transform/dispute'
import type { RawIntasendChargeback } from '../../../../../../../src/verticals/payments/adapters/intasend/transform/refund'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('intasend transformDispute', () => {
  it('maps PENDING status to "needs_response" with fraud reason', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-001',
      invoice: {
        invoice_id: 'INV-001',
        currency: 'KES',
      },
      amount: '500.00',
      reason: 'fraud detected on transaction',
      status: 'PENDING',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('KES')
    expect(result.chargeId).toBe('INV-001')
    expect(result.gateway).toBe('intasend')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps DISPUTED status to "under_review"', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-002',
      invoice: { invoice_id: 'INV-002', currency: 'KES' },
      amount: '100.00',
      status: 'DISPUTED',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps COMPLETED status to "won"', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-003',
      invoice: { invoice_id: 'INV-003', currency: 'KES' },
      amount: '200.00',
      status: 'COMPLETED',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "charge_refunded"', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-004',
      invoice: { invoice_id: 'INV-004', currency: 'KES' },
      amount: '75.00',
      status: 'CANCELLED',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('charge_refunded')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps OVERDUE status to "needs_response"', () => {
    const raw: RawIntasendChargeback = {
      id: 55,
      invoice: 'INV-005',
      amount: '30.00',
      status: 'OVERDUE',
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(result.id).toBe('55')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
