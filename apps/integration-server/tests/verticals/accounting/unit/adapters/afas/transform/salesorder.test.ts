import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type AfasSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeRaw(overrides: Partial<AfasSalesOrder> = {}): AfasSalesOrder {
  return {
    OrderNr: 'SO-001',
    DebtorId: 'DEB-001',
    Description: 'Software license order',
    AmtTotal: 800,
    CurrencyId: 'EUR',
    OrderDate: '2024-01-10',
    Status: 'O',
    ...overrides,
  }
}

describe('transformSalesOrder (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('SO-001')
    expect(result.contactId).toBe('DEB-001')
    expect(result.currency).toBe('EUR')
    // AmtTotal=800 → toMinorUnits → 80000
    expect(result.totalAmount).toBe(80000)
  })

  it('parses OrderDate as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('maps Status=O to ACTIVE', () => {
    const result = transformSalesOrder(makeRaw({ Status: 'O' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Status=D to COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ Status: 'D' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Status=C to CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ Status: 'C' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes SalesOrderSchema.parse without throwing', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
