import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawGeideaEInvoice,
} from '../../../../../../../src/verticals/payments/adapters/geidea/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('geidea transformInvoice', () => {
  it('maps a Paid invoice with amount to status "paid"', () => {
    const raw: RawGeideaEInvoice = {
      paymentIntentId: 'pi-001',
      number: 'INV-001',
      status: 'Paid',
      amount: 200.0,
      currency: 'EGP',
      customerId: 'cust-001',
      link: 'https://pay.geidea.net/inv/pi-001',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(20000)
    expect(result.amountDue).toBe(0)
    expect(result.amountPaid).toBe(20000)
    expect(result.hostedInvoiceUrl).toBe('https://pay.geidea.net/inv/pi-001')
    expect(result.gateway).toBe('geidea')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a Created invoice to status "open" with amountDue=total', () => {
    const raw: RawGeideaEInvoice = {
      paymentIntentId: 'pi-002',
      status: 'Created',
      amount: 50.0,
      currency: 'SAR',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(5000)
    expect(result.amountPaid).toBe(0)
    expect(result.currency).toBe('SAR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a Cancelled invoice to status "void"', () => {
    const raw: RawGeideaEInvoice = {
      paymentIntentId: 'pi-003',
      status: 'Cancelled',
      amount: 100.0,
      currency: 'AED',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an Expired invoice to status "uncollectible"', () => {
    const raw: RawGeideaEInvoice = {
      paymentIntentId: 'pi-004',
      status: 'Expired',
      amount: 75.5,
      currency: 'EGP',
      expiryDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(result.dueDate).toBeDefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('creates line item ids from eInvoiceDetails items', () => {
    const raw: RawGeideaEInvoice = {
      paymentIntentId: 'pi-005',
      status: 'Created',
      amount: 30.0,
      currency: 'EGP',
      eInvoiceDetails: {
        grandTotal: 30.0,
        subtotal: 30.0,
        eInvoiceItems: [{ description: 'Product A', price: 15.0, quantity: 2, total: 30.0 }],
      },
    }
    const result = transformInvoice(raw)
    expect(result.lineItemIds).toEqual(['pi-005-item-0'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
