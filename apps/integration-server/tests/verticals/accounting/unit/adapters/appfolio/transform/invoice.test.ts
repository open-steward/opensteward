import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AppFolioInvoice } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/invoice'

function makeInvoice(overrides: Partial<AppFolioInvoice> = {}): AppFolioInvoice {
  return {
    id: '1001',
    invoice_number: 'INV-2024-001',
    tenant_id: '42',
    property_id: 'prop_1',
    unit_id: 'unit_1',
    lease_id: 'lease_1',
    date: '2024-03-01',
    due_date: '2024-03-31',
    amount: 2500,
    tax_amount: 0,
    currency: 'USD',
    status: 'approved',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('parses ISO dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ invoice_number: 'INV-SPECIAL' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps voided status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'unknown' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      line_items: [
        {
          id: 10,
          description: 'Rent - March 2024',
          quantity: 1,
          unit_price: 2500,
          amount: 2500,
          account_id: '4001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Rent - March 2024')
    expect(li.unitAmount).toBe(2500)
    expect(li.totalAmount).toBe(2500)
    expect(li.accountId).toBe('4001')
  })

  it('returns empty lineItems when line_items is absent', () => {
    const raw = makeInvoice({ line_items: [] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits taxAmount when tax_amount is zero', () => {
    const result = transformInvoice(makeInvoice({ tax_amount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('converts numeric id to string', () => {
    const result = transformInvoice(makeInvoice({ id: 9999 }))
    expect(result.id).toBe('9999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
