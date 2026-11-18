import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type PeakAccountInvoice } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/invoice'

function makeInvoice(overrides: Partial<PeakAccountInvoice> = {}): PeakAccountInvoice {
  return {
    id: 'INV-001',
    documentNo: 'INV-2024-001',
    status: 'draft',
    issueDate: '2024-01-15',
    dueDate: '2024-02-15',
    totalAmount: 10700,
    vatAmount: 700,
    currency: 'THB',
    contactId: 'CUST-001',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('INV-001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(10700)
    expect(result.taxAmount).toBe(700)
    expect(result.currency).toBe('THB')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ documentNo: 'INV-SPECIAL' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps pending status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({
      items: [
        {
          id: 'ITEM-1',
          description: 'Widget',
          quantity: 2,
          unitPrice: 500,
          amount: 1000,
          vatAmount: 70,
          accountCode: '4000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ITEM-1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(70)
    expect(li.accountId).toBe('4000')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice(makeInvoice({ vatAmount: 0, currency: '' }))
    expect(result.taxAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
