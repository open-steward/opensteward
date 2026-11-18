import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type AcumaticaOrder } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/order'

function makeOrder(overrides: Partial<AcumaticaOrder> = {}): AcumaticaOrder {
  return {
    OrderNbr: 'SO001',
    OrderType: 'SO',
    Status: 'Open',
    CuryOrderTotal: 900,
    CurrencyID: 'USD',
    CustomerID: 'CUST001',
    OrderDate: '2024-03-01',
    Details: [],
    ...overrides,
  }
}

describe('transformOrder (Acumatica)', () => {
  it('maps id from OrderNbr', () => {
    expect(transformOrder(makeOrder()).id).toBe('SO001')
  })

  it('maps contacts from CustomerID', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('CUST001')
  })

  it('maps totalAmount from CuryOrderTotal', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(900)
  })

  it('maps currency from CurrencyID', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('parses OrderDate as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps Open status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ Status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformOrder(makeOrder({ Status: 'Hold' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
