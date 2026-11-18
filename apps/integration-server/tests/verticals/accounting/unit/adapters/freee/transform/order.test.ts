import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FreeeQuote } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/order'

function makeRaw(overrides: Partial<FreeeQuote> = {}): FreeeQuote {
  return {
    id: 4001,
    quote_number: 'QT-001',
    issue_date: '2024-09-01',
    due_date: '2024-09-30',
    total_amount_with_vat: 22000,
    total_vat_amount: 2000,
    status: 'draft',
    partner_id: 55,
    partner_name: 'Prospect Inc',
    quote_contents: [],
    ...overrides,
  }
}

describe('transformOrder (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('4001')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(22000)
    expect(result.type).toBe('SALES')
  })

  it('parses dates as Date objects', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to ACTIVE', () => {
    const result = transformOrder(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps sent status to ACTIVE', () => {
    const result = transformOrder(makeRaw({ status: 'sent' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps accepted status to COMPLETED', () => {
    const result = transformOrder(makeRaw({ status: 'accepted' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps refused status to CANCELLED', () => {
    const result = transformOrder(makeRaw({ status: 'refused' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps quote_contents to lineItems', () => {
    const raw = makeRaw({
      quote_contents: [
        {
          id: 1,
          name: 'Consulting Service',
          quantity: 1,
          unit_price: 20000,
          amount: 20000,
          vat_rate: 10,
          account_item_id: 400,
          account_item_name: 'Services',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Consulting Service')
    expect(result.lineItems![0].totalAmount).toBe(20000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
