import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type DirectoInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<DirectoInvoice> = {}): DirectoInvoice {
  return {
    number: '2001',
    date: '2024-03-01',
    duedate: '2024-04-01',
    customercode: 'CUST01',
    currency: 'EUR',
    sum: 121,
    vatsum: 21,
    sumwovat: 100,
    balance: 121,
    status: '',
    rows: [],
    ...overrides,
  }
}

describe('directo transformInvoice', () => {
  it('maps number to id as string', () => {
    const result = transformInvoice(makeRaw({ number: 55 }))
    expect(result.id).toBe('55')
  })

  it('type is always INVOICE', () => {
    const result = transformInvoice(makeRaw())
    expect(result.type).toBe('INVOICE')
  })

  it('maps customercode to contactId', () => {
    const result = transformInvoice(makeRaw({ customercode: 'C99' }))
    expect(result.contactId).toBe('C99')
  })

  it('status: cancelled → VOIDED', () => {
    const result = transformInvoice(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('status: balance=0 and sum!=0 → PAID', () => {
    const result = transformInvoice(makeRaw({ balance: 0, sum: 100, status: '' }))
    expect(result.status).toBe('PAID')
  })

  it('status: 0 < balance < sum → PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ balance: 40, sum: 121, status: '' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('status: booked → AUTHORIZED', () => {
    const result = transformInvoice(
      makeRaw({ status: 'booked', balance: undefined, sum: undefined }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('status: empty → DRAFT', () => {
    const result = transformInvoice(
      makeRaw({ status: 'draft', balance: undefined, sum: undefined }),
    )
    expect(result.status).toBe('DRAFT')
  })

  it('maps row description (not name) to itemDescription', () => {
    const result = transformInvoice(
      makeRaw({ rows: [{ rn: 1, description: 'Widget', price: 10, quantity: 1, sum: 10 }] }),
    )
    expect(result.lineItems?.[0]?.itemDescription).toBe('Widget')
  })

  it('maps row discount to discountAmount', () => {
    const result = transformInvoice(makeRaw({ rows: [{ rn: 1, discount: 5 }] }))
    expect(result.lineItems?.[0]?.discountAmount).toBe(5)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformInvoice(makeRaw({ date: '2024-01-10' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('directo untransformInvoice', () => {
  it('maps contactId to customercode', () => {
    const result = untransformInvoice({ contactId: 'C42', currency: 'EUR' })
    expect(result.customercode).toBe('C42')
  })

  it('maps currency', () => {
    const result = untransformInvoice({ currency: 'USD' })
    expect(result.currency).toBe('USD')
  })

  it('formats postedAt to date string', () => {
    const result = untransformInvoice({ postedAt: new Date('2024-06-15T00:00:00.000Z') })
    expect(result.date).toBe('2024-06-15')
  })
})
