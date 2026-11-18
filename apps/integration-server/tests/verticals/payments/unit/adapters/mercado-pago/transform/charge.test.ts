import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawMPPayment,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('mercado-pago transformCharge', () => {
  const base: RawMPPayment = {
    id: 987654321,
    status: 'approved',
    transaction_amount: 149.99,
    transaction_amount_refunded: 0,
    currency_id: 'BRL',
    description: 'Test purchase',
    external_reference: 'order-42',
    payer: { id: 'payer-1', email: 'buyer@example.com' },
    payment_method_id: 'visa',
    date_created: '2024-03-01T12:00:00.000Z',
    date_last_updated: '2024-03-01T12:05:00.000Z',
    status_detail: 'accredited',
    metadata: { orderId: 'ord-99' },
  }

  it('maps id, amount, and currency correctly', () => {
    const result = transformCharge(base)
    expect(result.id).toBe('987654321')
    expect(result.amount).toBe(14999) // 149.99 * 100
    expect(result.currency).toBe('BRL')
  })

  it('maps approved status to succeeded', () => {
    const result = transformCharge(base)
    expect(result.status).toBe('succeeded')
  })

  it('maps payer fields to customerId and receiptEmail', () => {
    const result = transformCharge(base)
    expect(result.customerId).toBe('payer-1')
    expect(result.receiptEmail).toBe('buyer@example.com')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformCharge(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('maps status: pending → pending', () => {
    const result = transformCharge({ ...base, status: 'pending' })
    expect(result.status).toBe('pending')
  })

  it('maps status: rejected → failed', () => {
    const result = transformCharge({ ...base, status: 'rejected' })
    expect(result.status).toBe('failed')
  })

  it('maps status: refunded → refunded', () => {
    const result = transformCharge({ ...base, status: 'refunded' })
    expect(result.status).toBe('refunded')
  })

  it('maps status: charged_back → disputed', () => {
    const result = transformCharge({ ...base, status: 'charged_back' })
    expect(result.status).toBe('disputed')
  })

  it('converts partial refund amount to minor units', () => {
    const result = transformCharge({ ...base, transaction_amount_refunded: 50.0 })
    expect(result.amountRefunded).toBe(5000)
  })

  it('puts external_reference and payment_method_id in metadata', () => {
    const result = transformCharge(base)
    expect(result.metadata['external_reference']).toBe('order-42')
    expect(result.metadata['payment_method_id']).toBe('visa')
  })

  it('conforms to ChargeSchema', () => {
    expect(() => ChargeSchema.parse(transformCharge(base))).not.toThrow()
  })

  it('defaults currency to ARS when currency_id is absent', () => {
    const result = transformCharge({ ...base, currency_id: undefined })
    expect(result.currency).toBe('ARS')
  })
})
