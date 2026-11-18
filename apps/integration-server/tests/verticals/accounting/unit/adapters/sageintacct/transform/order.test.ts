import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type IntacctOrder,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/order'

function makeOrder(overrides: Partial<IntacctOrder> = {}): IntacctOrder {
  return {
    RECORDNO: 'ord-1',
    DOCID: 'ORD-2024-001',
    CUSTOMERID: 'cust-1',
    WHENORDERED: '2024-03-01',
    WHENEXPIRED: '2024-06-01',
    CURRENCY: 'USD',
    TOTAL: '2000.00',
    STATE: 'Pending',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps RECORDNO to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-1')
  })

  it('maps CUSTOMERID to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('parses TOTAL as totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(2000)
  })

  it('parses WHENORDERED as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps STATE Draft to ACTIVE', () => {
    expect(transformOrder(makeOrder({ STATE: 'Draft' })).status).toBe('ACTIVE')
  })

  it('maps STATE Pending to ACTIVE', () => {
    expect(transformOrder(makeOrder({ STATE: 'Pending' })).status).toBe('ACTIVE')
  })

  it('maps STATE Closed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ STATE: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps STATE Cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ STATE: 'Cancelled' })).status).toBe('CANCELLED')
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
