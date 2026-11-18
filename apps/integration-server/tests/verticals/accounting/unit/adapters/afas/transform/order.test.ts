import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type AfasOrder,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<AfasOrder> = {}): AfasOrder {
  return {
    OrderNr: 'ORD-001',
    DebtorId: 'DEB-002',
    Description: 'Delivery order',
    AmtTotal: 600,
    CurrencyId: 'EUR',
    OrderDate: '2024-02-05',
    Status: 'O',
    ...overrides,
  }
}

describe('transformOrder (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('ORD-001')
    expect(result.contactId).toBe('DEB-002')
    expect(result.currency).toBe('EUR')
    // AmtTotal=600 → toMinorUnits → 60000
    expect(result.totalAmount).toBe(60000)
    expect(result.type).toBe('SALES')
  })

  it('parses OrderDate as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-02-05'))
  })

  it('maps Status=D to COMPLETED', () => {
    const result = transformOrder(makeRaw({ Status: 'D' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Status=C to CANCELLED', () => {
    const result = transformOrder(makeRaw({ Status: 'C' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps Status=O to ACTIVE', () => {
    const result = transformOrder(makeRaw({ Status: 'O' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
