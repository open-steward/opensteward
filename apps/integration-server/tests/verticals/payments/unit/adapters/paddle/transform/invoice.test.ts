import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawPaddleInvoice,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('paddle transformInvoice', () => {
  it('maps a completed Paddle transaction/invoice to paid canonical Invoice', () => {
    const raw: RawPaddleInvoice = {
      id: 'txn_inv_001',
      invoice_number: 'INV-2024-001',
      customer_id: 'ctm_001',
      subscription_id: 'sub_001',
      status: 'completed',
      currency_code: 'usd',
      details: {
        totals: {
          subtotal: '4132',
          tax: '867',
          total: '4999',
          balance: '0',
        },
      },
      created_at: '2024-04-01T09:00:00Z',
      updated_at: '2024-04-01T09:05:00Z',
      billed_at: '2024-04-01T09:05:00Z',
    }
    const result = transformInvoice(raw)

    expect(result.id).toBe('txn_inv_001')
    expect(result.externalId).toBe('txn_inv_001')
    expect(result.number).toBe('INV-2024-001')
    expect(result.customerId).toBe('ctm_001')
    expect(result.subscriptionId).toBe('sub_001')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('USD')
    expect(result.subtotal).toBe(4132)
    expect(result.tax).toBe(867)
    expect(result.total).toBe(4999)
    expect(result.amountDue).toBe(0)
    expect(result.gateway).toBe('paddle')
    expect(result.createdAt).toBe('2024-04-01T09:00:00Z')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a billed status to open', () => {
    const raw: RawPaddleInvoice = {
      id: 'txn_inv_002',
      status: 'billed',
      currency_code: 'EUR',
      details: { totals: { total: '2000' } },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft status to draft', () => {
    const raw: RawPaddleInvoice = {
      id: 'txn_inv_003',
      status: 'draft',
      currency_code: 'GBP',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled status to void', () => {
    const raw: RawPaddleInvoice = {
      id: 'txn_inv_004',
      status: 'canceled',
      currency_code: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a past_due status to uncollectible', () => {
    const raw: RawPaddleInvoice = {
      id: 'txn_inv_005',
      status: 'past_due',
      currency_code: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('defaults amounts to 0 and currency to USD when fields are absent', () => {
    const raw: RawPaddleInvoice = {
      id: 'txn_inv_006',
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('USD')
    expect(result.subtotal).toBe(0)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(0)
    expect(result.amountDue).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
