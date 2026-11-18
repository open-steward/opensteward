import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MyobSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/salesorder'

function makeSO(overrides: Partial<MyobSalesOrder> = {}): MyobSalesOrder {
  return { UID: 'uid-11', Customer: { UID: 'cust-1' }, TotalAmount: 2500, Status: 'Open', ...overrides }
}

describe('transformSalesOrder (myob)', () => {
  it('maps id and contactId', () => {
    expect(transformSalesOrder(makeSO()).id).toBe('uid-11')
    expect(transformSalesOrder(makeSO()).contactId).toBe('cust-1')
  })
  it('Closed → COMPLETED', () => { expect(transformSalesOrder(makeSO({ Status: 'Closed' })).status).toBe('COMPLETED') })
  it('maps totalAmount', () => { expect(transformSalesOrder(makeSO()).totalAmount).toBe(2500) })
  it('passes raw as metadata', () => {
    const raw = makeSO()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSO())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
