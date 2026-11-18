import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawCybersourceInvoice,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('cybersource transformInvoice', () => {
  it('maps a PAID invoice with all fields', () => {
    const raw: RawCybersourceInvoice = {
      id: 'inv_1',
      status: 'PAID',
      submitTimeUtc: '2023-11-14T10:00:00Z',
      customerInformation: {
        name: 'Bob Jones',
        email: 'bob@test.com',
      },
      invoiceInformation: {
        invoiceNumber: 'INV-100',
        description: 'Monthly service fee',
        dueDate: '2023-12-01T00:00:00Z',
        paymentLink: 'https://pay.cybersource.com/inv_1',
        deliveryMode: 'EMAIL',
      },
      orderInformation: {
        amountDetails: {
          totalAmount: '150.00',
          currency: 'USD',
          balanceAmount: '0.00',
        },
      },
    }
    const result = transformInvoice(raw)

    expect(result.id).toBe('inv_1')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(15000)
    expect(result.amountDue).toBe(0)
    expect(result.amountPaid).toBe(15000)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('bob@test.com')
    expect(result.gateway).toBe('cybersource')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a DRAFT invoice to draft status', () => {
    const raw: RawCybersourceInvoice = {
      id: 'inv_2',
      status: 'DRAFT',
      orderInformation: {
        amountDetails: { totalAmount: '50.00', currency: 'GBP', balanceAmount: '50.00' },
      },
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('draft')
    expect(result.amountDue).toBe(5000)
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED invoice to void status', () => {
    const raw: RawCybersourceInvoice = {
      id: 'inv_3',
      status: 'CANCELED',
      orderInformation: {
        amountDetails: { totalAmount: '75.00', currency: 'EUR' },
      },
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a SENT invoice to open status', () => {
    const raw: RawCybersourceInvoice = {
      id: 'inv_4',
      status: 'SENT',
      orderInformation: {
        amountDetails: { totalAmount: '200.00', currency: 'USD', balanceAmount: '200.00' },
      },
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('open')
    expect(result.total).toBe(20000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
