import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawPayPalInvoice,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('paypal transformInvoice', () => {
  it('maps a PAID invoice', () => {
    const raw: RawPayPalInvoice = {
      id: 'INV-001',
      status: 'PAID',
      detail: { invoice_number: 'PP-INV-001', currency_code: 'USD' },
      amount: { value: '120.00', currency_code: 'USD' },
      due_amount: { value: '0.00' },
      payments: { paid_amount: { value: '120.00' } },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.number).toBe('PP-INV-001')
    expect(result.total).toBe(12000)
    expect(result.amountPaid).toBe(12000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('paypal')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a DRAFT invoice', () => {
    const raw: RawPayPalInvoice = {
      id: 'INV-002',
      status: 'DRAFT',
      detail: { currency_code: 'EUR' },
      amount: { value: '50.00', currency_code: 'EUR' },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED invoice to status "void"', () => {
    const raw: RawPayPalInvoice = {
      id: 'INV-003',
      status: 'CANCELLED',
      detail: { currency_code: 'GBP' },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
