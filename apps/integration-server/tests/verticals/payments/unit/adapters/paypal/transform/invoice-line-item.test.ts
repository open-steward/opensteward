import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawPayPalInvoiceItem,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('paypal transformInvoiceLineItem', () => {
  it('maps an invoice item with unit_amount and quantity', () => {
    const raw: RawPayPalInvoiceItem = {
      id: 'ITEM-001',
      name: 'Widget',
      description: 'Blue widget',
      quantity: '3',
      unit_amount: { value: '15.00', currency_code: 'USD' },
      amount: { value: '45.00', currency_code: 'USD' },
    }
    const result = transformInvoiceLineItem(raw, 'INV-001')
    expect(result.invoiceId).toBe('INV-001')
    expect(result.description).toBe('Widget')
    expect(result.quantity).toBe(3)
    expect(result.unitAmount).toBe(1500)
    expect(result.amount).toBe(4500)
    expect(result.currency).toBe('USD')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('falls back to unit_amount for total when amount is absent', () => {
    const raw: RawPayPalInvoiceItem = {
      id: 'ITEM-002',
      name: 'Service',
      quantity: '1',
      unit_amount: { value: '99.00', currency_code: 'EUR' },
    }
    const result = transformInvoiceLineItem(raw, 'INV-002')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})
