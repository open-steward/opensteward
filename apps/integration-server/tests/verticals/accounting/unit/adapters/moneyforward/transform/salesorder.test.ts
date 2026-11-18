import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MoneyForwardQuoteSO } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/salesorder'

function makeRaw(overrides: Partial<MoneyForwardQuoteSO> = {}): MoneyForwardQuoteSO {
  return {
    id: 'so-001',
    quote_number: 'SO-2024-001',
    quote_date: '2024-09-01',
    expiry_date: '2024-09-30',
    price_before_tax: 15000,
    price: 16500,
    tax: 1500,
    status: 'draft',
    partner_id: 'partner-020',
    partner_name: 'Customer Corp',
    ...overrides,
  }
}

describe('transformSalesOrder (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('so-001')
    expect(result.contactId).toBe('partner-020')
    expect(result.totalAmount).toBe(16500)
  })

  it('parses quote_date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-09-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps accepted status to COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ status: 'accepted' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps rejected status to CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ status: 'rejected' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps draft status to ACTIVE', () => {
    const result = transformSalesOrder(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
