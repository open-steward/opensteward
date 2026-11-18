import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type DeskeraOrder,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/order'

function makeRaw(overrides: Partial<DeskeraOrder> = {}): DeskeraOrder {
  return {
    id: 'SO-001',
    documentSequenceCode: 'SO-2024-001',
    documentDate: '2024-01-15',
    validTillDate: '2024-02-15',
    totalAmount: 10000,
    taxAmount: 900,
    currency: 'SGD',
    contactCode: 'CUST-001',
    contactName: 'Acme Pte Ltd',
    status: 'OPEN',
    documentItems: [],
    ...overrides,
  }
}

describe('transformOrder (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('SO-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(10000)
    expect(result.currency).toBe('SGD')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps CLOSED status to COMPLETED', () => {
    const result = transformOrder(makeRaw({ status: 'CLOSED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps CANCELLED status correctly', () => {
    const result = transformOrder(makeRaw({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps OPEN to ACTIVE', () => {
    const result = transformOrder(makeRaw({ status: 'OPEN' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
