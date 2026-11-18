import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type TallyOrder,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/order'

function makeOrder(overrides: Partial<TallyOrder> = {}): TallyOrder {
  return {
    VOUCHERNUMBER: 'ORD/2024/001',
    PARTYLEDGERNAME: 'Big Retail Chain',
    DATE: '20240715',
    AMOUNT: '15000.00',
    NARRATION: 'Sales order for Q3',
    ORDERSTATUS: 'Open',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps VOUCHERNUMBER to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ORD/2024/001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('Big Retail Chain')
  })

  it('parses AMOUNT to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(15000)
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-07-15'))
  })

  it('always sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps ORDERSTATUS Open to ACTIVE', () => {
    expect(transformOrder(makeOrder({ ORDERSTATUS: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps ORDERSTATUS Closed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ ORDERSTATUS: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps absent ORDERSTATUS to ACTIVE', () => {
    expect(transformOrder(makeOrder({ ORDERSTATUS: undefined })).status).toBe('ACTIVE')
  })

  it('sets contactId to undefined when PARTYLEDGERNAME is empty', () => {
    expect(transformOrder(makeOrder({ PARTYLEDGERNAME: '' })).contactId).toBeUndefined()
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    expect(transformOrder(makeOrder({ AMOUNT: 'N/A' })).totalAmount).toBeUndefined()
  })

  it('sets postedAt to undefined when DATE is invalid', () => {
    expect(transformOrder(makeOrder({ DATE: 'bad-date' })).postedAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
