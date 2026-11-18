import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type BillitOrder,
} from '../../../../../../../src/verticals/accounting/adapters/billit/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeOrder(overrides: Partial<BillitOrder> = {}): BillitOrder {
  return {
    OrderID: 101,
    OrderNumber: 'INV-101',
    OrderStatus: 'ToPay',
    Paid: false,
    Currency: 'EUR',
    TotalIncl: 24200,
    TotalVAT: 2200,
    ToPay: 24200,
    OrderDate: '2024-03-01',
    ExpiryDate: '2024-03-31',
    CounterParty: { PartyID: 'cust-1', Name: 'Test Customer' },
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps OrderID to id as string', () => {
    expect(transformInvoice(makeOrder()).id).toBe('101')
  })

  it('type is always INVOICE', () => {
    expect(transformInvoice(makeOrder()).type).toBe('INVOICE')
  })

  it('maps OrderNumber to invoiceNumber', () => {
    expect(transformInvoice(makeOrder()).invoiceNumber).toBe('INV-101')
  })

  it('maps CounterParty.PartyID to contactId', () => {
    expect(transformInvoice(makeOrder()).contactId).toBe('cust-1')
  })

  it('falls back to Customer when no CounterParty', () => {
    const raw = makeOrder({
      CounterParty: undefined,
      Customer: { PartyID: 'cust-fallback', Name: 'Fallback' },
    })
    expect(transformInvoice(raw).contactId).toBe('cust-fallback')
  })

  it('falls back to CounterParty.Nr when PartyID absent', () => {
    const raw = makeOrder({ CounterParty: { Nr: 'nr-99', Name: 'NR Customer' } })
    expect(transformInvoice(raw).contactId).toBe('nr-99')
  })

  it('maps ToPay status to AUTHORIZED when fully outstanding', () => {
    expect(
      transformInvoice(makeOrder({ OrderStatus: 'ToPay', ToPay: 24200, TotalIncl: 24200 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps ToPay status to PARTIALLY_PAID when ToPay < TotalIncl', () => {
    const raw = makeOrder({ OrderStatus: 'ToPay', ToPay: 10000, TotalIncl: 24200 })
    expect(transformInvoice(raw).status).toBe('PARTIALLY_PAID')
  })

  it('maps tosend status to AUTHORIZED', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'ToSend' })).status).toBe('AUTHORIZED')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'Sent' })).status).toBe('AUTHORIZED')
  })

  it('maps invoiced status to AUTHORIZED', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'Invoiced' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'Paid' })).status).toBe('PAID')
  })

  it('maps Paid=true boolean to PAID', () => {
    expect(transformInvoice(makeOrder({ Paid: true, OrderStatus: 'ToPay' })).status).toBe('PAID')
  })

  it('maps Canceled status to VOIDED', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'Canceled' })).status).toBe('VOIDED')
  })

  it('maps credited status to VOIDED', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'Credited' })).status).toBe('VOIDED')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeOrder({ OrderStatus: 'Draft' })).status).toBe('DRAFT')
  })

  it('computes paidAmount as TotalIncl - ToPay when partially paid', () => {
    const raw = makeOrder({ TotalIncl: 24200, ToPay: 10000, OrderStatus: 'ToPay' })
    expect(transformInvoice(raw).paidAmount).toBe(14200)
  })

  it('computes paidAmount as full TotalIncl when Paid=true', () => {
    const raw = makeOrder({ TotalIncl: 24200, ToPay: 0, Paid: true })
    expect(transformInvoice(raw).paidAmount).toBe(24200)
  })

  it('omits paidAmount when not paid and ToPay equals TotalIncl', () => {
    const raw = makeOrder({ TotalIncl: 24200, ToPay: 24200, Paid: false, OrderStatus: 'ToPay' })
    expect(transformInvoice(raw).paidAmount).toBeUndefined()
  })

  it('parses OrderDate and ExpiryDate as Date objects', () => {
    const result = transformInvoice(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps order lines to lineItems', () => {
    const raw = makeOrder({
      OrderLines: [
        {
          OrderLineID: 1,
          ProductID: 99,
          Description: 'Widget',
          Quantity: 3,
          UnitPriceExcl: 5000,
          TotalVAT: 300,
          TotalIncl: 5300,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('99')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitQuantity).toBe(3)
    expect(li.unitAmount).toBe(5000)
    expect(li.totalAmount).toBe(5300)
    expect(li.taxAmount).toBe(300)
  })

  it('passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeOrder()))).not.toThrow()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  describe('untransformInvoice round-trip', () => {
    it('produces OrderType=Invoice and OrderDirection=Income', () => {
      const invoice = transformInvoice(makeOrder())
      const back = untransformInvoice(invoice)
      expect(back.OrderType).toBe('Invoice')
      expect(back.OrderDirection).toBe('Income')
    })

    it('preserves currency and reference on round-trip', () => {
      const raw = makeOrder({ Currency: 'USD', Reference: 'PO-999' })
      const invoice = transformInvoice(raw)
      const back = untransformInvoice(invoice)
      expect(back.Currency).toBe('USD')
      expect(back.Reference).toBe('PO-999')
    })

    it('preserves order date on round-trip', () => {
      const raw = makeOrder({ OrderDate: '2024-06-15' })
      const invoice = transformInvoice(raw)
      const back = untransformInvoice(invoice)
      expect(back.OrderDate).toBe('2024-06-15')
    })
  })
})
