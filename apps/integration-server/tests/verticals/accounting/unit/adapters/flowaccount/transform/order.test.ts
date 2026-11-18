import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type FlowAccountOrder } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/order'

function makeOrder(overrides: Partial<FlowAccountOrder> = {}): FlowAccountOrder {
  return {
    id: 1000,
    documentSerial: 'ORD2024-00001',
    statusId: 2,
    issuedDate: '2024-01-05',
    amountTotal: 21400,
    currencyCode: 'THB',
    contactCode: 'CUST-002',
    items: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1000')
    expect(result.contactId).toBe('CUST-002')
    expect(result.totalAmount).toBe(21400)
    expect(result.currency).toBe('THB')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps statusId 1 to DRAFT', () => {
    expect(transformOrder(makeOrder({ statusId: 1 })).status).toBe('DRAFT')
  })

  it('maps statusId 2 to ACTIVE', () => {
    expect(transformOrder(makeOrder({ statusId: 2 })).status).toBe('ACTIVE')
  })

  it('maps statusId 3 to COMPLETED', () => {
    expect(transformOrder(makeOrder({ statusId: 3 })).status).toBe('COMPLETED')
  })

  it('maps statusId 4 to CANCELLED', () => {
    expect(transformOrder(makeOrder({ statusId: 4 })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
