import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type TallySalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/salesorder'

function makeSalesOrder(overrides: Partial<TallySalesOrder> = {}): TallySalesOrder {
  return {
    VOUCHERNUMBER: 'SO-001',
    PARTYLEDGERNAME: 'Customer Co',
    DATE: '20240115',
    AMOUNT: '50000',
    NARRATION: 'Order for widgets',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps VOUCHERNUMBER to id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('SO-001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('Customer Co')
  })

  it('parses AMOUNT to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(50000)
  })

  it('parses DATE to postedAt Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps ORDERSTATUS undefined to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ ORDERSTATUS: undefined }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps ORDERSTATUS "Closed" to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ ORDERSTATUS: 'Closed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps ORDERSTATUS other values to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ ORDERSTATUS: 'Open' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    const result = transformSalesOrder(makeSalesOrder({ AMOUNT: 'N/A' }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
