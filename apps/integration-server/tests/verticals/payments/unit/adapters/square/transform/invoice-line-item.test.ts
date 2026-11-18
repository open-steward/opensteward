import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawSquarePaymentRequest,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('square transformInvoiceLineItem', () => {
  it('maps a payment request to an invoice line item', () => {
    const raw: RawSquarePaymentRequest = {
      uid: 'PR-001',
      request_type: 'BALANCE',
      request_method: 'EMAIL',
      due_date: '2024-07-31T00:00:00Z',
      computed_amount_money: { amount: 7500, currency: 'USD' },
    }
    const result = transformInvoiceLineItem(raw, 'INV-001')
    expect(result.id).toBe('PR-001')
    expect(result.invoiceId).toBe('INV-001')
    expect(result.description).toBe('BALANCE')
    expect(result.amount).toBe(7500)
    expect(result.currency).toBe('USD')
    expect(result.periodEnd).toBe('2024-07-31T00:00:00Z')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('defaults amount to 0 when computed_amount_money is absent', () => {
    const raw: RawSquarePaymentRequest = {
      uid: 'PR-002',
      request_type: 'DEPOSIT',
    }
    const result = transformInvoiceLineItem(raw, 'INV-002')
    expect(result.amount).toBe(0)
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})
