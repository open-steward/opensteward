import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/salesorder'
import type { MorningDocument } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/invoice'

function makeDocument(overrides: Partial<MorningDocument> = {}): MorningDocument {
  return {
    id: 'so_1',
    type: 200,
    status: 1,
    number: 'SO-001',
    sum: 4500,
    vat: 765,
    currency: 'ILS',
    date: '2024-03-12',
    client: { id: 'client_9' },
    ...overrides,
  }
}

describe('transformSalesOrder (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeDocument())
    expect(result.id).toBe('so_1')
    expect(result.contactId).toBe('client_9')
    expect(result.totalAmount).toBe(4500)
    expect(result.currency).toBe('ILS')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-12'))
  })

  it('maps status 1 to ACTIVE', () => {
    const result = transformSalesOrder(makeDocument({ status: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status 2 to COMPLETED', () => {
    const result = transformSalesOrder(makeDocument({ status: 2 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status -1 to CANCELLED', () => {
    const result = transformSalesOrder(makeDocument({ status: -1 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeDocument())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
