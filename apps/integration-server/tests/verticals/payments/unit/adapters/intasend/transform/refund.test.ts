import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawIntasendChargeback,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('intasend transformRefund', () => {
  it('maps a COMPLETED chargeback to status "succeeded"', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-001',
      invoice: {
        invoice_id: 'INV-001',
        currency: 'KES',
      },
      amount: 250.0,
      status: 'COMPLETED',
      reason: 'Customer requested refund',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('cb-001')
    expect(result.chargeId).toBe('INV-001')
    expect(result.amount).toBe(25000)
    expect(result.currency).toBe('KES')
    expect(result.reason).toBe('other')
    expect(result.gateway).toBe('intasend')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED chargeback to status "cancelled"', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-002',
      invoice: { invoice_id: 'INV-002', currency: 'KES' },
      amount: 100.0,
      status: 'CANCELLED',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING chargeback to status "pending"', () => {
    const raw: RawIntasendChargeback = {
      id: 42,
      invoice: 'INV-003',
      amount: 50.0,
      status: 'PENDING',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.id).toBe('42')
    expect(result.chargeId).toBe('INV-003')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('extracts chargeId from nested transaction.invoice', () => {
    const raw: RawIntasendChargeback = {
      chargeback_id: 'cb-004',
      transaction: {
        invoice: { invoice_id: 'INV-TXN-001', currency: 'KES' },
      },
      amount: 30.0,
      status: 'COMPLETED',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('INV-TXN-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
