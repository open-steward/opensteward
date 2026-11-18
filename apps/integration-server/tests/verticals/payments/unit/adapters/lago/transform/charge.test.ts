import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawLagoPayment,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('lago transformCharge', () => {
  it('maps a succeeded payment to status "succeeded" with correct amount', () => {
    const raw: RawLagoPayment = {
      lago_id: 'pay-001',
      lago_customer_id: 'cust-001',
      external_customer_id: 'ext-cust-001',
      invoice_ids: ['inv-001'],
      amount_cents: 4999,
      amount_currency: 'usd',
      payment_status: 'succeeded',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('ext-cust-001')
    expect(result.gateway).toBe('lago')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payment to status "failed"', () => {
    const raw: RawLagoPayment = {
      lago_id: 'pay-002',
      amount_cents: 1000,
      amount_currency: 'EUR',
      payment_status: 'failed',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payment to status "pending"', () => {
    const raw: RawLagoPayment = {
      lago_id: 'pay-003',
      amount_cents: 2000,
      amount_currency: 'GBP',
      payment_status: 'pending',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('sets captured=false and amountCaptured=0 when not succeeded', () => {
    const raw: RawLagoPayment = {
      lago_id: 'pay-004',
      amount_cents: 500,
      payment_status: 'pending',
    }
    const result = transformCharge(raw)
    expect(result.captured).toBe(false)
    expect(result.amountCaptured).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
