import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type DeskeraSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/salesorder'

function makeRaw(overrides: Partial<DeskeraSalesOrder> = {}): DeskeraSalesOrder {
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

describe('transformSalesOrder (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('SO-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(10000)
    expect(result.currency).toBe('SGD')
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps CLOSED status to COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ status: 'CLOSED' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps CANCELLED status correctly', () => {
    const result = transformSalesOrder(makeRaw({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps DRAFT to ACTIVE', () => {
    const result = transformSalesOrder(makeRaw({ status: 'DRAFT' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
