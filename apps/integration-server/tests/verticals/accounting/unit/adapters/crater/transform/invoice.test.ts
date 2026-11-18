import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  untransformInvoice,
  type CraterInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<CraterInvoice> = {}): CraterInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-0001',
    status: 'SENT',
    paid_status: 'UNPAID',
    customer_business_id: 'biz-5',
    invoice_date: '2026-01-10',
    due_date: '2026-02-10',
    total: 12000,
    sub_total: 10000,
    tax: 2000,
    discount: 0,
    discount_type: 'fixed',
    discount_val: 0,
    due_amount: 12000,
    notes: 'Thank you for your business',
    currency: { code: 'USD' },
    items: [],
    created_at: '2026-01-10T09:00:00.000Z',
    updated_at: '2026-01-10T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (crater)', () => {
  it('maps id and invoiceNumber', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-1')
    expect(result.invoiceNumber).toBe('INV-0001')
  })

  it('maps type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps contactId from customer_business_id', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('biz-5')
  })

  it('maps currency from currency.code', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps totalAmount, taxAmount, balanceAmount', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(12000)
    expect(result.taxAmount).toBe(2000)
    expect(result.balanceAmount).toBe(12000)
  })

  it('computes paidAmount as total minus due_amount', () => {
    const result = transformInvoice(makeInvoice({ total: 12000, due_amount: 7000 }))
    expect(result.paidAmount).toBe(5000)
  })

  it('parses invoice_date as postedAt and due_date as dueAt', () => {
    const result = transformInvoice(makeInvoice())
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-01-10')).toBe(true)
    expect(expectDate(result.dueAt).toISOString().startsWith('2026-02-10')).toBe(true)
  })

  it('SENT status → AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT', paid_status: 'UNPAID' })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('VIEWED status → AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'VIEWED', paid_status: 'UNPAID' })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('DRAFT status → DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT', paid_status: 'UNPAID' })).status).toBe(
      'DRAFT',
    )
  })

  it('paid_status PAID → PAID regardless of status', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT', paid_status: 'PAID' })).status).toBe(
      'PAID',
    )
  })

  it('COMPLETED status → PAID', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'COMPLETED', paid_status: 'UNPAID' })).status,
    ).toBe('PAID')
  })

  it('paid_status PARTIALLY_PAID → PARTIALLY_PAID', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'SENT', paid_status: 'PARTIALLY_PAID' })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('OVERDUE status → OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'OVERDUE', paid_status: 'UNPAID' })).status).toBe(
      'OVERDUE',
    )
  })

  it('maps line items', () => {
    const result = transformInvoice(
      makeInvoice({
        items: [
          {
            id: 'li-1',
            name: 'Widget',
            description: 'Blue widget',
            price: 1000,
            quantity: 2,
            discount: 0,
            discount_type: 'fixed',
            sub_total: 2000,
            tax: 200,
            total: 2200,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemName).toBe('Widget')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(2200)
  })

  it('attaches raw as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('round-trips contactId and notes', () => {
      const invoice = transformInvoice(makeInvoice())
      const back = untransformInvoice(invoice)
      expect(back['customer_business_id']).toBe('biz-5')
      expect(back['notes']).toBe('Thank you for your business')
    })

    it('formats dates as YYYY-MM-DD strings', () => {
      const invoice = transformInvoice(makeInvoice())
      const back = untransformInvoice(invoice)
      expect(back['invoice_date']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(back['due_date']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})
