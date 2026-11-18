import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/order'
import type { MorningDocument } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/invoice'

function makeDocument(overrides: Partial<MorningDocument> = {}): MorningDocument {
  return {
    id: 'ord_1',
    type: 100,
    status: 1,
    number: 'ORD-001',
    sum: 3000,
    vat: 510,
    currency: 'ILS',
    date: '2024-03-10',
    client: { id: 'client_7' },
    ...overrides,
  }
}

describe('transformOrder (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeDocument())
    expect(result.id).toBe('ord_1')
    expect(result.contactId).toBe('client_7')
    expect(result.totalAmount).toBe(3000)
    expect(result.currency).toBe('ILS')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformOrder(makeDocument({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 1 to ACTIVE', () => {
    const result = transformOrder(makeDocument({ status: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status 2 to COMPLETED', () => {
    const result = transformOrder(makeDocument({ status: 2 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status -1 to CANCELLED', () => {
    const result = transformOrder(makeDocument({ status: -1 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeDocument())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
