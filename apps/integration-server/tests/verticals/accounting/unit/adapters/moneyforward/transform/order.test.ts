import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MoneyForwardQuote } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/order'

function makeRaw(overrides: Partial<MoneyForwardQuote> = {}): MoneyForwardQuote {
  return {
    id: 'qt-001',
    quote_number: 'QT-2024-001',
    quote_date: '2024-08-01',
    expiry_date: '2024-08-31',
    price_before_tax: 20000,
    price: 22000,
    tax: 2000,
    status: 'draft',
    partner_id: 'partner-010',
    partner_name: 'Prospect Ltd',
    ...overrides,
  }
}

describe('transformOrder (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('qt-001')
    expect(result.contactId).toBe('partner-010')
    expect(result.totalAmount).toBe(22000)
    expect(result.type).toBe('SALES')
  })

  it('parses dates as Date objects', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
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

  it('maps rejected status to CANCELLED', () => {
    const result = transformOrder(makeRaw({ status: 'rejected' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
