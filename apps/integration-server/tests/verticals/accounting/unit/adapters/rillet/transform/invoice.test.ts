import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RilletInvoice,
  type RilletInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeItem(overrides: Partial<RilletInvoiceItem> = {}): RilletInvoiceItem {
  return {
    id: 'li_1',
    description: 'Enterprise License',
    quantity: '1.0000',
    gross_rate: { amount: '1000.00', currency: 'USD' },
    total_amount: { amount: '1080.00', currency: 'USD' },
    total_discount: { amount: '0.00', currency: 'USD' },
    taxed_amount: { amount: '80.00', currency: 'USD' },
    product_id: 'prod_ent',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<RilletInvoice> = {}): RilletInvoice {
  return {
    id: 'inv_1042',
    subsidiary_id: 'sub_1',
    invoice_number: 'INV-1042',
    customer_id: 'cust_1',
    items: [makeItem()],
    due_date: '2026-03-03',
    invoice_date: '2026-02-01',
    status: 'UNPAID',
    net_amount: { amount: '1000.00', currency: 'USD' },
    amount_due: { amount: '1080.00', currency: 'USD' },
    total: { amount: '1080.00', currency: 'USD' },
    subtotal: { amount: '1000.00', currency: 'USD' },
    total_discount: { amount: '0.00', currency: 'USD' },
    taxed_amount: { amount: '80.00', currency: 'USD' },
    payment_terms: 30,
    purchase_order_number: 'PO-ACME-2026',
    memo: 'Thank you for your business.',
    overdue: false,
    updated_at: '2026-02-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id directly', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv_1042')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-1042')
  })

  it('maps customer_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust_1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps currency from total.currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('converts total.amount string to minor units', () => {
    // "1080.00" → 108000
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(108000)
  })

  it('converts taxed_amount.amount string to minor units', () => {
    // "80.00" → 8000
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(8000)
  })

  it('converts total_discount.amount string to minor units', () => {
    // "0.00" → 0
    expect(transformInvoice(makeInvoice()).discountAmount).toBe(0)
  })

  it('converts amount_due.amount string to minor units (balanceAmount)', () => {
    // "1080.00" → 108000
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(108000)
  })

  it('maps purchase_order_number to reference', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('PO-ACME-2026')
  })

  it('maps memo to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Thank you for your business.')
  })

  it('maps UNPAID + overdue=false to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'UNPAID', overdue: false })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps UNPAID + overdue=true to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'UNPAID', overdue: true })).status).toBe(
      'OVERDUE',
    )
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID', overdue: false })).status).toBe('PAID')
  })

  it('maps PARTIALLY_PAID status to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PARTIALLY_PAID', overdue: false })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps UNBILLED status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'UNBILLED', overdue: false })).status).toBe(
      'DRAFT',
    )
  })

  it('maps CREDITED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CREDITED', overdue: false })).status).toBe(
      'VOIDED',
    )
  })

  it('maps PARTIALLY_CREDITED like an open invoice: something is still due', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'PARTIALLY_CREDITED', overdue: false })).status,
    ).toBe('AUTHORIZED')
    expect(
      transformInvoice(makeInvoice({ status: 'PARTIALLY_CREDITED', overdue: true })).status,
    ).toBe('OVERDUE')
  })

  it('maps invoice_date to postedAt Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2026-02-01'))
  })

  it('maps due_date to dueAt Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2026-03-03'))
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformInvoice(makeInvoice()).updatedAt).toEqual(new Date('2026-02-02T10:00:00Z'))
  })

  it('maps lineitem fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li_1')
    expect(li.itemId).toBe('prod_ent')
    expect(li.itemDescription).toBe('Enterprise License')
    expect(li.unitQuantity).toBe(1)
    // "1000.00" → 100000
    expect(li.unitAmount).toBe(100000)
    // "1080.00" → 108000
    expect(li.totalAmount).toBe(108000)
    // "80.00" → 8000
    expect(li.taxAmount).toBe(8000)
    // "0.00" → 0
    expect(li.discountAmount).toBe(0)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces output that passes InvoiceSchema validation', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a status outside the documented enum to unknown, not AUTHORIZED', () => {
    expect(InvoiceSchema.parse(transformInvoice(makeInvoice({ status: 'VOID' }))).status).toBe(
      'unknown',
    )
  })

  it('parses the documented decimal-string quantity', () => {
    const inv = makeInvoice({ items: [makeItem({ quantity: '3.0000' })] })
    expect(InvoiceSchema.parse(transformInvoice(inv)).lineItems?.[0]?.unitQuantity).toBe(3)
  })

  it('still parses a v3.0 numeric quantity', () => {
    const inv = makeInvoice({ items: [makeItem({ quantity: 4 })] })
    expect(InvoiceSchema.parse(transformInvoice(inv)).lineItems?.[0]?.unitQuantity).toBe(4)
  })

  it('does not scale a zero-decimal currency (JPY) by 100', () => {
    const jpy = (amount: string) => ({ amount, currency: 'JPY' })
    const inv = makeInvoice({
      items: [
        makeItem({
          gross_rate: jpy('10000'),
          total_amount: jpy('11000'),
          total_discount: jpy('0'),
          taxed_amount: jpy('1000'),
        }),
      ],
      net_amount: jpy('10000'),
      amount_due: jpy('11000'),
      total: jpy('11000'),
      subtotal: jpy('10000'),
      total_discount: jpy('0'),
      taxed_amount: jpy('1000'),
    })
    const out = InvoiceSchema.parse(transformInvoice(inv))
    expect(out.currency).toBe('JPY')
    expect(out.totalAmount).toBe(11000)
    expect(out.taxAmount).toBe(1000)
    expect(out.balanceAmount).toBe(11000)
    expect(out.lineItems?.[0]?.unitAmount).toBe(10000)
    expect(out.lineItems?.[0]?.totalAmount).toBe(11000)
  })

  it('scales a three-decimal currency (KWD) by 1000', () => {
    const kwd = (amount: string) => ({ amount, currency: 'KWD' })
    const inv = makeInvoice({
      items: [
        makeItem({
          gross_rate: kwd('100.000'),
          total_amount: kwd('105.125'),
          total_discount: kwd('0.000'),
          taxed_amount: kwd('5.125'),
        }),
      ],
      net_amount: kwd('100.000'),
      amount_due: kwd('105.125'),
      total: kwd('105.125'),
      subtotal: kwd('100.000'),
      total_discount: kwd('0.000'),
      taxed_amount: kwd('5.125'),
    })
    const out = InvoiceSchema.parse(transformInvoice(inv))
    expect(out.currency).toBe('KWD')
    expect(out.totalAmount).toBe(105125)
    expect(out.taxAmount).toBe(5125)
    expect(out.balanceAmount).toBe(105125)
    expect(out.lineItems?.[0]?.unitAmount).toBe(100000)
    expect(out.lineItems?.[0]?.taxAmount).toBe(5125)
  })
})
