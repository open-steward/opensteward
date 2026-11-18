import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type MelioInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/melio/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<MelioInvoice> = {}): MelioInvoice {
  return {
    id: 'inv_001',
    invoiceNumber: 'INV-100',
    customerId: 'cust_42',
    amount: 75000, // integer minor units passed through directly
    balance: 75000,
    currency: 'USD',
    status: 'AUTHORIZED',
    invoiceDate: '2024-03-01T00:00:00.000Z',
    dueDate: '2024-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (melio)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv_001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-100')
  })

  it('maps customerId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust_42')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(75000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(75000)
  })

  it('computes paidAmount from total - balance', () => {
    const result = transformInvoice(makeInvoice({ balance: 30000 }))
    expect(result.paidAmount).toBe(45000) // 75000 - 30000
  })

  it('returns undefined paidAmount when fully unpaid', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBeUndefined()
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps status PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID', balance: 0 })).status).toBe('PAID')
  })

  it('maps status DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PARTIALLY_PAID' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps line items', () => {
    const raw = makeInvoice({
      lineItems: [
        { id: 'li_1', description: 'Service fee', amount: 10000, quantity: 2, unitPrice: 5000 },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('li_1')
    expect(result.lineItems![0].itemDescription).toBe('Service fee')
    expect(result.lineItems![0].totalAmount).toBe(10000)
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('maps notes', () => {
    expect(transformInvoice(makeInvoice({ notes: 'Payment due in 30 days' })).notes).toBe(
      'Payment due in 30 days',
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('round-trips invoiceNumber → invoiceNumber', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.invoiceNumber).toBe('INV-100')
    })

    it('round-trips customerId via contactId → customerId', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.customerId).toBe('cust_42')
    })

    it('round-trips currency', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.currency).toBe('USD')
    })

    it('round-trips amount via totalAmount', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.amount).toBe(75000)
    })
  })
})
