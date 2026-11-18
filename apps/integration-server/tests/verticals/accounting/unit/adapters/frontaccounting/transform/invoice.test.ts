import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FAInvoice } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/invoice'

function makeRaw(overrides: Partial<FAInvoice> = {}): FAInvoice {
  return {
    id: 101,
    reference: 'INV-2024-001',
    tran_date: '2024-01-15',
    due_date: '2024-02-15',
    debtor_no: 5,
    curr_code: 'USD',
    total: 1200,
    tax_total: 200,
    balance: 1200,
    status: 1,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('101')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('5')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps line items', () => {
    const result = transformInvoice(
      makeRaw({
        lines: [{ id: 1, stock_id: 'PROD-1', description: 'Widget', quantity: 2, unit_price: 600, amount: 1200, tax_amount: 200 }],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].totalAmount).toBe(1200)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
