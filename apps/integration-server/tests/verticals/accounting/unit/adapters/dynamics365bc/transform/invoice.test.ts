import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BCInvoice, type BCInvoiceLine } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/invoice'

function makeInvoice(overrides: Partial<BCInvoice> = {}): BCInvoice {
  return {
    id: 'bc-inv-001',
    number: 'INV-2024-001',
    customerId: 'cust-abc',
    customerName: 'Acme Corp',
    postingDate: '2024-01-10',
    invoiceDate: '2024-01-15',
    dueDate: '2024-02-15',
    currencyCode: 'USD',
    totalAmountIncludingTax: 12500,
    totalTaxAmount: 2500,
    remainingAmountIncludingTax: 12500,
    status: 'Open',
    invoiceLines: [],
    ...overrides,
  }
}

function makeInvoiceLine(overrides: Partial<BCInvoiceLine> = {}): BCInvoiceLine {
  return {
    id: 'line-001',
    lineType: 'Item',
    lineObjectNumber: 'ITEM-42',
    description: 'Widget Pro',
    quantity: 5,
    unitPrice: 2000,
    taxAmount: 500,
    totalAmountIncludingTax: 2500,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('bc-inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('cust-abc')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Open status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Open' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps In Review status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'In Review' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Canceled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Canceled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps Corrective status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Corrective' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      invoiceLines: [makeInvoiceLine()],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-001')
    expect(li.itemId).toBe('ITEM-42')
    expect(li.itemDescription).toBe('Widget Pro')
    expect(li.unitAmount).toBe(2000)
    expect(li.unitQuantity).toBe(5)
    expect(li.taxAmount).toBe(500)
    expect(li.totalAmount).toBe(2500)
  })

  it('produces empty lineItems when invoiceLines is absent', () => {
    const raw = makeInvoice({ invoiceLines: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits invoiceNumber when number is empty', () => {
    const result = transformInvoice(makeInvoice({ number: '' }))
    expect(result.invoiceNumber).toBeUndefined()
  })

  it('omits contactId when customerId is empty', () => {
    const result = transformInvoice(makeInvoice({ customerId: '' }))
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
