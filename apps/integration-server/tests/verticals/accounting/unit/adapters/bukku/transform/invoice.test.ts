import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BukkuInvoice } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/invoice'

function makeRaw(overrides: Partial<BukkuInvoice> = {}): BukkuInvoice {
  return {
    id: '101',
    number: 'INV-001',
    date: '2024-03-01',
    due_date: '2024-03-31',
    total: 1150,
    tax_total: 150,
    balance_due: 1150,
    sub_total: 1000,
    currency_code: 'MYR',
    contact_id: '42',
    contact_name: 'Acme Sdn Bhd',
    status: 'draft',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('101')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(1150)
    expect(result.taxAmount).toBe(150)
    expect(result.balanceAmount).toBe(1150)
    expect(result.currency).toBe('MYR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'INV-999' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('INV-999')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ status: 'sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps overdue status to OVERDUE', () => {
    const result = transformInvoice(makeRaw({ status: 'overdue' }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps void status to VOIDED', () => {
    const result = transformInvoice(makeRaw({ status: 'void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: '1',
          description: 'Widget',
          quantity: 5,
          unit_price: 200,
          amount: 1000,
          tax_amount: 150,
          account_id: '400',
          account_code: '4-001',
          tax_rate_id: '10',
          discount: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(150)
    expect(li.accountId).toBe('400')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
