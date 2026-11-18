import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type EBoekhoudenInvoice, type EBoekhoudenLine } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/invoice'

function makeInvoice(overrides: Partial<EBoekhoudenInvoice> = {}): EBoekhoudenInvoice {
  return {
    id: 'eb-inv-001',
    invoiceNumber: 'FV-2024-042',
    relationId: 'rel-99',
    invoiceDate: '2024-03-01',
    dueDate: '2024-04-01',
    currencyCode: 'EUR',
    totalAmount: 5000,
    amountPaid: 0,
    vat: 950,
    status: 'open',
    lines: [],
    ...overrides,
  }
}

function makeLine(overrides: Partial<EBoekhoudenLine> = {}): EBoekhoudenLine {
  return {
    id: 'ln-01',
    description: 'Consulting hours',
    quantity: 10,
    price: 400,
    amount: 4000,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('eb-inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('FV-2024-042')
    expect(result.contactId).toBe('rel-99')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(950)
    expect(result.paidAmount).toBe(0)
    expect(result.balanceAmount).toBe(5000)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps open status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'open' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps overdue status to OVERDUE', () => {
    const result = transformInvoice(makeInvoice({ status: 'overdue' }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'unknown_status' }))
    expect(result.status).toBe('DRAFT')
  })

  it('calculates balanceAmount as totalAmount minus amountPaid', () => {
    const result = transformInvoice(makeInvoice({ totalAmount: 5000, amountPaid: 2000 }))
    expect(result.balanceAmount).toBe(3000)
    expect(result.paidAmount).toBe(2000)
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({ lines: [makeLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ln-01')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(400)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(4000)
  })

  it('produces empty lineItems when lines is absent', () => {
    const raw = makeInvoice({ lines: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits invoiceNumber when empty', () => {
    const result = transformInvoice(makeInvoice({ invoiceNumber: '' }))
    expect(result.invoiceNumber).toBeUndefined()
  })

  it('omits contactId when relationId is empty', () => {
    const result = transformInvoice(makeInvoice({ relationId: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('omits postedAt when invoiceDate is empty', () => {
    const result = transformInvoice(makeInvoice({ invoiceDate: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('omits dueAt when dueDate is empty', () => {
    const result = transformInvoice(makeInvoice({ dueDate: '' }))
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
