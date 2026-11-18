import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawRazorpayLineItem,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('razorpay transformInvoiceLineItem', () => {
  it('maps a line item with name, amount, quantity and invoiceId', () => {
    const raw: RawRazorpayLineItem = {
      id: 'li_1',
      name: 'Pro Plan',
      description: 'Monthly subscription',
      amount: 4900,
      unit_amount: 4900,
      quantity: 1,
      currency: 'INR',
    }
    const result = transformInvoiceLineItem(raw, 'inv_abc')

    expect(result.id).toBe('li_1')
    expect(result.invoiceId).toBe('inv_abc')
    expect(result.description).toBe('Pro Plan')
    expect(result.amount).toBe(4900)
    expect(result.unitAmount).toBe(4900)
    expect(result.quantity).toBe(1)
    expect(result.currency).toBe('INR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('falls back to description field when name is absent', () => {
    const raw: RawRazorpayLineItem = {
      id: 'li_2',
      description: 'Setup fee',
      amount: 1000,
      currency: 'INR',
    }
    const result = transformInvoiceLineItem(raw, 'inv_def')

    expect(result.description).toBe('Setup fee')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})
