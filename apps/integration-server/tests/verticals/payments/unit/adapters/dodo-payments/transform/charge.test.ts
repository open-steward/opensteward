import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawDodoPayment,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('dodo-payments transformCharge', () => {
  it('maps a succeeded payment with full fields', () => {
    const raw: RawDodoPayment = {
      payment_id: 'pay_001',
      business_id: 'biz_001',
      brand_id: 'brand_01',
      total_amount: 9999,
      currency: 'usd',
      status: 'succeeded',
      customer: {
        customer_id: 'cus_001',
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      payment_method: 'pm_card_001',
      payment_method_type: 'card',
      card_last_four: '4242',
      card_network: 'visa',
      invoice_id: 'inv_001',
      subscription_id: 'sub_001',
      payment_link: 'https://receipt.example.com/pay_001',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay_001')
    expect(result.externalId).toBe('pay_001')
    expect(result.amount).toBe(9999)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('cus_001')
    expect(result.receiptEmail).toBe('jane@example.com')
    expect(result.paymentMethodId).toBe('pm_card_001')
    expect(result.invoiceId).toBe('inv_001')
    expect(result.subscriptionId).toBe('sub_001')
    expect(result.receiptUrl).toBe('https://receipt.example.com/pay_001')
    expect(result.gateway).toBe('dodo-payments')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" correctly and captured is false', () => {
    const raw: RawDodoPayment = {
      payment_id: 'pay_002',
      total_amount: 500,
      currency: 'USD',
      status: 'failed',
      error_code: 'card_declined',
      error_message: 'Your card was declined.',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBe(false)
    expect(result.failureCode).toBe('card_declined')
    expect(result.failureMessage).toBe('Your card was declined.')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps dispute_status to "disputed" overriding base status', () => {
    const raw: RawDodoPayment = {
      payment_id: 'pay_003',
      total_amount: 2000,
      currency: 'USD',
      status: 'succeeded',
      dispute_status: 'dispute_opened',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps refund_status "full" to "refunded"', () => {
    const raw: RawDodoPayment = {
      payment_id: 'pay_004',
      total_amount: 1500,
      currency: 'USD',
      status: 'succeeded',
      refund_status: 'full',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps processing status to "pending"', () => {
    const raw: RawDodoPayment = {
      payment_id: 'pay_005',
      total_amount: 750,
      currency: 'USD',
      status: 'processing',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawDodoPayment = {
      payment_id: 'pay_006',
      total_amount: 100,
      currency: 'USD',
      status: 'cancelled',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.customerId).toBeUndefined()
    expect(result.invoiceId).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
