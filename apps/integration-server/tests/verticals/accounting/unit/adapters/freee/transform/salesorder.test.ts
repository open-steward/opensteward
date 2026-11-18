import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FreeeQuoteSO } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/salesorder'

function makeRaw(overrides: Partial<FreeeQuoteSO> = {}): FreeeQuoteSO {
  return {
    id: 4002,
    quote_number: 'SO-001',
    issue_date: '2024-10-01',
    due_date: '2024-10-31',
    total_amount_with_vat: 33000,
    total_vat_amount: 3000,
    status: 'draft',
    partner_id: 66,
    partner_name: 'Client AB',
    quote_contents: [],
    ...overrides,
  }
}

describe('transformSalesOrder (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('4002')
    expect(result.contactId).toBe('66')
    expect(result.totalAmount).toBe(33000)
  })

  it('parses issue_date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-10-01'))
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

  it('maps refused status to CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ status: 'refused' }))
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
