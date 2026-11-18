import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawEbanxPayment,
} from '../../../../../../../src/verticals/payments/adapters/ebanx/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('ebanx transformCharge', () => {
  it('maps a CO payment to status "succeeded"', () => {
    const raw: RawEbanxPayment = {
      hash: 'EBANX-HASH-001',
      merchant_payment_code: 'order-001',
      status: 'CO',
      amount_ext: '100.00',
      currency_ext: 'BRL',
      payment_type_code: 'visa',
      open_date: '2024-03-01 00:00:00',
      confirm_date: '2024-03-01 01:00:00',
      status_date: '2024-03-01 01:00:00',
      customer: { email: 'buyer@example.com' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('BRL')
    expect(result.gateway).toBe('ebanx')
    expect(result.id).toBe('EBANX-HASH-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PE payment to status "pending"', () => {
    const raw: RawEbanxPayment = {
      hash: 'EBANX-HASH-002',
      status: 'PE',
      amount_ext: '50.00',
      currency_ext: 'USD',
      open_date: '2024-03-01 00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an OP payment to status "pending"', () => {
    const raw: RawEbanxPayment = {
      hash: 'EBANX-HASH-003',
      status: 'OP',
      amount_ext: '25.00',
      currency_ext: 'BRL',
      open_date: '2024-03-01 00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CA payment to status "cancelled"', () => {
    const raw: RawEbanxPayment = {
      hash: 'EBANX-HASH-004',
      status: 'CA',
      amount_ext: '75.00',
      currency_ext: 'BRL',
      open_date: '2024-03-01 00:00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CO payment with all confirmed refunds to "refunded"', () => {
    const raw: RawEbanxPayment = {
      hash: 'EBANX-HASH-005',
      status: 'CO',
      amount_ext: '100.00',
      currency_ext: 'BRL',
      open_date: '2024-03-01 00:00:00',
      refunds: [{ id: 'R001', status: 'CO', amount_ext: '100.00', currency_ext: 'BRL' }],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.refundIds).toEqual(['R001'])
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CO payment with a pending refund to "partially_refunded"', () => {
    const raw: RawEbanxPayment = {
      hash: 'EBANX-HASH-006',
      status: 'CO',
      amount_ext: '100.00',
      currency_ext: 'BRL',
      open_date: '2024-03-01 00:00:00',
      refunds: [{ id: 'R002', status: 'PE', amount_ext: '40.00', currency_ext: 'BRL' }],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
