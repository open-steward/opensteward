import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type MoneybirdSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/salesorder'

function makeSO(overrides: Partial<MoneybirdSalesOrder> = {}): MoneybirdSalesOrder {
  return { id: 1100, contact_id: 200, total_price_incl_tax: '1500', currency: 'EUR', state: 'open', ...overrides }
}

describe('transformSalesOrder (moneybird)', () => {
  it('maps id and contactId', () => {
    expect(transformSalesOrder(makeSO()).id).toBe('1100')
    expect(transformSalesOrder(makeSO()).contactId).toBe('200')
  })
  it('draft → DRAFT', () => { expect(transformSalesOrder(makeSO({ state: 'draft' })).status).toBe('DRAFT') })
  it('invoiced → COMPLETED', () => { expect(transformSalesOrder(makeSO({ state: 'invoiced' })).status).toBe('COMPLETED') })
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
