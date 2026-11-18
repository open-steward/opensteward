import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type FattureCloudSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/salesorder'

function makeSO(overrides: Partial<FattureCloudSalesOrder> = {}): FattureCloudSalesOrder {
  return { id: 80, entity: { id: 5 }, date: '2024-09-01', currency: { id: 'EUR' }, totals: { amount: 1500 }, status: { id: 'accepted' }, ...overrides }
}

describe('transformSalesOrder (fatturecloud)', () => {
  it('maps id and contactId', () => {
    expect(transformSalesOrder(makeSO()).id).toBe('80')
    expect(transformSalesOrder(makeSO()).contactId).toBe('5')
  })
  it('draft → DRAFT', () => { expect(transformSalesOrder(makeSO({ status: { id: 'draft' } })).status).toBe('DRAFT') })
  it('invoiced → COMPLETED', () => { expect(transformSalesOrder(makeSO({ status: { id: 'invoiced' } })).status).toBe('COMPLETED') })
  it('maps totalAmount', () => { expect(transformSalesOrder(makeSO()).totalAmount).toBe(1500) })
  it('passes raw as metadata', () => {
    const raw = makeSO()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSO())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
