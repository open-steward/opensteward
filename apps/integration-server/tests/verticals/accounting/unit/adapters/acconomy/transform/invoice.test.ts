import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type AcconomyInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/acconomy/transform/invoice'

function makeInvoice(overrides: Partial<AcconomyInvoice> = {}): AcconomyInvoice {
  return {
    id: 201,
    invoice_number: 'ACC-001',
    created_date: '2024-06-01',
    due_date: '2024-06-30',
    currency: 'EUR',
    total: 5000,
    tax: 1000,
    balance: 5000,
    state: 'issued',
    contact_id: 99,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Acconomy)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('201')
    expect(result.invoiceNumber).toBe('ACC-001')
    expect(result.contactId).toBe('99')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(1000)
    expect(result.balanceAmount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
    expect(result.dueAt).toEqual(new Date('2024-06-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps issued state to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ state: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps paid state to PAID', () => {
    expect(transformInvoice(makeInvoice({ state: 'paid' })).status).toBe('PAID')
  })

  it('maps draft state to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps voided state to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ state: 'voided' })).status).toBe('VOIDED')
  })

  it('maps unknown state to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ state: 'pending' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 5,
          description: 'Software license',
          qty: 2,
          unit_price: 500,
          total: 1000,
          tax: 200,
          account_id: 4000,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('5')
    expect(li.itemDescription).toBe('Software license')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('4000')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice({ id: 999 })
    expect(result.id).toBe('999')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
