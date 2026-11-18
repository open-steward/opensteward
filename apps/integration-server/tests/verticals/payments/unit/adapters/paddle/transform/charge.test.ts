import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPaddleTransaction,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paddle transformCharge', () => {
  it('maps a completed Paddle transaction to succeeded canonical Charge', () => {
    const raw: RawPaddleTransaction = {
      id: 'txn_paddle_001',
      status: 'completed',
      customer_id: 'ctm_001',
      subscription_id: 'sub_001',
      invoice_id: 'inv_001',
      origin: 'web',
      currency_code: 'usd',
      details: {
        totals: {
          grand_total: '4999',
          total: '4999',
          subtotal: '4132',
          tax: '867',
        },
      },
      payments: [
        {
          id: 'pay_001',
          status: 'captured',
          method_details: { type: 'card' },
        },
      ],
      custom_data: { order_ref: 'ORDER-42' },
      created_at: '2024-04-01T09:00:00Z',
      updated_at: '2024-04-01T09:05:00Z',
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('txn_paddle_001')
    expect(result.externalId).toBe('txn_paddle_001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.customerId).toBe('ctm_001')
    expect(result.subscriptionId).toBe('sub_001')
    expect(result.invoiceId).toBe('inv_001')
    expect(result.paymentMethodId).toBe('pay_001')
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.origin).toBe('web')
    expect(result.metadata.payment_method_type).toBe('card')
    expect(result.metadata.tax_amount).toBe('867')
    expect(result.metadata.order_ref).toBe('ORDER-42')
    expect(result.createdAt).toBe('2024-04-01T09:00:00Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled transaction to cancelled status', () => {
    const raw: RawPaddleTransaction = {
      id: 'txn_paddle_002',
      status: 'canceled',
      currency_code: 'EUR',
      details: { totals: { grand_total: '1000' } },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a draft transaction to pending status', () => {
    const raw: RawPaddleTransaction = {
      id: 'txn_paddle_003',
      status: 'draft',
      currency_code: 'GBP',
      details: { totals: { grand_total: '2000' } },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to totals.total when grand_total is absent', () => {
    const raw: RawPaddleTransaction = {
      id: 'txn_paddle_004',
      status: 'completed',
      currency_code: 'USD',
      details: { totals: { total: '3500' } },
    }
    const result = transformCharge(raw)
    expect(result.amount).toBe(3500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults to USD and 0 amount when currency and totals are missing', () => {
    const raw: RawPaddleTransaction = {
      id: 'txn_paddle_005',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
