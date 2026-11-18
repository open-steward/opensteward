import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type CampfireInvoice,
  type CampfireInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoiceLine(overrides: Partial<CampfireInvoiceLine> = {}): CampfireInvoiceLine {
  return {
    id: 1,
    description: 'Premium Widget',
    quantity: 2,
    rate: 50.0,
    amount: 100.0,
    tax: 10.0,
    product: 5,
    product_name: 'Widget',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<CampfireInvoice> = {}): CampfireInvoice {
  return {
    id: 101,
    invoice_number: 'INV-101',
    invoice_date: '2024-03-01',
    due_date: '2024-04-01',
    created_at: '2024-02-28T08:00:00Z',
    last_modified_at: '2024-03-01T12:00:00Z',
    client: 42,
    currency: 'USD',
    total_amount: 110.0,
    amount_paid: 0.0,
    amount_due: 110.0,
    payment_status: 'open',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-101')
  })

  it('maps client to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('converts total_amount to minor units', () => {
    expect(transformInvoice(makeInvoice({ total_amount: 110.0 })).totalAmount).toBe(11000)
  })

  it('converts amount_paid to paidAmount in minor units', () => {
    expect(transformInvoice(makeInvoice({ amount_paid: 50.0 })).paidAmount).toBe(5000)
  })

  it('converts amount_due to balanceAmount in minor units', () => {
    expect(transformInvoice(makeInvoice({ amount_due: 110.0 })).balanceAmount).toBe(11000)
  })

  it('maps payment_status open to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps payment_status sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps payment_status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'paid' })).status).toBe('PAID')
  })

  it('maps payment_status partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'partial' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps payment_status voided to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps payment_status uncollectible to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ payment_status: 'uncollectible' })).status).toBe('VOIDED')
  })

  it('falls back to status field when payment_status is null', () => {
    expect(transformInvoice(makeInvoice({ payment_status: null, status: 'draft' })).status).toBe(
      'DRAFT',
    )
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ payment_status: null, status: 'draft' })).status).toBe(
      'DRAFT',
    )
  })

  it('maps invoice_date to postedAt Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps due_date to dueAt Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps paid_date to paidAt Date', () => {
    const result = transformInvoice(makeInvoice({ paid_date: '2024-03-15' }))
    expect(result.paidAt).toEqual(new Date('2024-03-15'))
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformInvoice(makeInvoice()).createdAt).toEqual(new Date('2024-02-28T08:00:00Z'))
  })

  it('maps last_modified_at to updatedAt Date', () => {
    expect(transformInvoice(makeInvoice()).updatedAt).toEqual(new Date('2024-03-01T12:00:00Z'))
  })

  it('maps purchase_order_number to reference', () => {
    const result = transformInvoice(makeInvoice({ purchase_order_number: 'PO-XYZ' }))
    expect(result.reference).toBe('PO-XYZ')
  })

  it('maps message_on_invoice to notes', () => {
    const result = transformInvoice(makeInvoice({ message_on_invoice: 'Thank you!' }))
    expect(result.notes).toBe('Thank you!')
  })

  it('maps line items with amount conversion', () => {
    const raw = makeInvoice({ lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('5')
    expect(li.itemName).toBe('Widget')
    expect(li.itemDescription).toBe('Premium Widget')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(1000)
  })

  it('defaults to empty lineItems when lines is absent', () => {
    const result = transformInvoice(makeInvoice({ lines: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })
})

describe('untransformInvoice', () => {
  it('maps contactId back to client as number', () => {
    const result = untransformInvoice({ contactId: '42' })
    expect(result.client).toBe(42)
  })

  it('maps currency', () => {
    expect(untransformInvoice({ currency: 'USD' }).currency).toBe('USD')
  })

  it('converts unitAmount from minor units to decimal dollars in lines', () => {
    const result = untransformInvoice({
      lineItems: [{ unitAmount: 5000, totalAmount: 10000, taxAmount: 1000 }],
    })
    const lines = result.lines as Array<Record<string, unknown>>
    expect(lines[0].rate).toBe(50)
    expect(lines[0].amount).toBe(100)
    expect(lines[0].tax).toBe(10)
  })

  it('maps postedAt to invoice_date as ISO date string', () => {
    const result = untransformInvoice({ postedAt: new Date('2024-03-01T00:00:00Z') })
    expect(result.invoice_date).toBe('2024-03-01')
  })

  it('maps dueAt to due_date as ISO date string', () => {
    const result = untransformInvoice({ dueAt: new Date('2024-04-01T00:00:00Z') })
    expect(result.due_date).toBe('2024-04-01')
  })

  it('maps invoiceNumber to invoice_number', () => {
    expect(untransformInvoice({ invoiceNumber: 'INV-101' }).invoice_number).toBe('INV-101')
  })

  it('maps reference to purchase_order_number', () => {
    expect(untransformInvoice({ reference: 'PO-XYZ' }).purchase_order_number).toBe('PO-XYZ')
  })

  it('maps notes to message_on_invoice', () => {
    expect(untransformInvoice({ notes: 'Thank you!' }).message_on_invoice).toBe('Thank you!')
  })

  it('round-trips totalAmount through transform then untransform', () => {
    const canonical = transformInvoice(makeInvoice({ total_amount: 55.5 }))
    // totalAmount = 5550 in canonical
    expect(canonical.totalAmount).toBe(5550)
    // untransform line with totalAmount 5550 should give 55.5
    const back = untransformInvoice({
      lineItems: [{ totalAmount: canonical.totalAmount }],
    }) as { lines: Array<{ amount: number }> }
    expect(back.lines[0].amount).toBe(55.5)
  })
})
