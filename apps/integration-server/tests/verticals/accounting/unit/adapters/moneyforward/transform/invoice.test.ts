import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MoneyForwardBilling } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/invoice'

function makeRaw(overrides: Partial<MoneyForwardBilling> = {}): MoneyForwardBilling {
  return {
    id: 'bf-001',
    title: 'Invoice for April',
    billing_number: 'BF-2024-001',
    billing_date: '2024-04-01',
    due_date: '2024-04-30',
    price_before_tax: 10000,
    price: 11000,
    tax: 1000,
    outstanding_amount: 11000,
    payment_status: 'unconfirmed',
    excise_type: 'ten_percent',
    partner_id: 'partner-001',
    partner_name: 'Acme Corp',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('bf-001')
    expect(result.invoiceNumber).toBe('BF-2024-001')
    expect(result.contactId).toBe('partner-001')
    expect(result.totalAmount).toBe(11000)
    expect(result.taxAmount).toBe(1000)
    expect(result.balanceAmount).toBe(11000)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps unconfirmed payment_status to DRAFT', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'unconfirmed' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps pending payment_status to DRAFT', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'pending' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps unsettled payment_status to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'unsettled' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps settled payment_status to PAID', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'settled' }))
    expect(result.status).toBe('PAID')
  })

  it('maps items to lineItems', () => {
    const raw = makeRaw({
      items: [
        {
          id: 'item-1',
          name: 'Consulting',
          quantity: 2,
          unit_price: 5000,
          price: 10000,
          excise: 1000,
          excise_type: 'ten_percent',
          detail: null,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(1000)
  })

  it('returns undefined contactId when partner_id is null', () => {
    const result = transformInvoice(makeRaw({ partner_id: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
