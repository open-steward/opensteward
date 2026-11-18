import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/order'
import type { ICountInvoice } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/invoice'

function makeInvoice(overrides: Partial<ICountInvoice> = {}): ICountInvoice {
  return {
    doc_id: 'ord_20',
    doc_type: 'order',
    status: 'open',
    sum: 1500,
    vat_sum: 255,
    currency_code: 'ILS',
    client_id: 'clt_10',
    date: '2024-03-12',
    due_date: '2024-04-12',
    doc_number: 'ORD-20',
    ...overrides,
  }
}

describe('transformOrder (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeInvoice())
    expect(result.id).toBe('ord_20')
    expect(result.contactId).toBe('clt_10')
    expect(result.totalAmount).toBe(1500)
    expect(result.currency).toBe('ILS')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-12'))
  })

  it('maps status draft to DRAFT', () => {
    const result = transformOrder(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status open to ACTIVE', () => {
    const result = transformOrder(makeInvoice({ status: 'open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status paid to COMPLETED', () => {
    const result = transformOrder(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    const result = transformOrder(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeInvoice())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
