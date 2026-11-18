import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ExactInvoice, type ExactInvoiceLine } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/invoice'

function makeInvoice(overrides: Partial<ExactInvoice> = {}): ExactInvoice {
  return {
    InvoiceID: 'exact-uuid-001',
    InvoiceNumber: 20240042,
    OrderedBy: 'customer-uuid-999',
    InvoiceDate: '2024-05-01',
    DueDate: '2024-06-01',
    Currency: 'EUR',
    AmountDC: 8800,
    VATAmountDC: 1800,
    Status: 20,
    InvoiceLines: { results: [] },
    ...overrides,
  }
}

function makeInvoiceLine(overrides: Partial<ExactInvoiceLine> = {}): ExactInvoiceLine {
  return {
    Item: 'item-uuid-001',
    Description: 'Software License',
    Quantity: 2,
    UnitPrice: 3500,
    AmountDC: 7000,
    VATAmountDC: 1400,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('exact-uuid-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('20240042')
    expect(result.contactId).toBe('customer-uuid-999')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(8800)
    expect(result.taxAmount).toBe(1800)
  })

  it('converts InvoiceNumber (number) to string for invoiceNumber', () => {
    const result = transformInvoice(makeInvoice({ InvoiceNumber: 99999 }))
    expect(result.invoiceNumber).toBe('99999')
    expect(typeof result.invoiceNumber).toBe('string')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-06-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 10 to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ Status: 10 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 20 to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 20 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status 50 to PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 50 }))
    expect(result.status).toBe('PAID')
  })

  it('maps status 60 to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ Status: 60 }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 99 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      InvoiceLines: { results: [makeInvoiceLine()] },
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('item-uuid-001')
    expect(li.itemDescription).toBe('Software License')
    expect(li.unitAmount).toBe(3500)
    expect(li.unitQuantity).toBe(2)
    expect(li.taxAmount).toBe(1400)
    expect(li.totalAmount).toBe(7000)
  })

  it('produces empty lineItems when InvoiceLines results is absent', () => {
    const raw = makeInvoice({ InvoiceLines: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('produces empty lineItems when results array is absent', () => {
    const raw = makeInvoice({ InvoiceLines: {} })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits contactId when OrderedBy is empty', () => {
    const result = transformInvoice(makeInvoice({ OrderedBy: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('omits postedAt when InvoiceDate is empty', () => {
    const result = transformInvoice(makeInvoice({ InvoiceDate: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('omits dueAt when DueDate is empty', () => {
    const result = transformInvoice(makeInvoice({ DueDate: '' }))
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
