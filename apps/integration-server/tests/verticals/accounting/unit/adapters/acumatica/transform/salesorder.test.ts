import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type AcumaticaSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/salesorder'

function makeSalesOrder(overrides: Partial<AcumaticaSalesOrder> = {}): AcumaticaSalesOrder {
  return {
    OrderNbr: 'SSO001',
    OrderType: 'SO',
    Status: 'Open',
    CuryOrderTotal: 1500,
    CurrencyID: 'USD',
    CustomerID: 'CUST002',
    OrderDate: '2024-03-05',
    RequestDate: '2024-03-20',
    Details: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Acumatica)', () => {
  it('maps id from OrderNbr', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('SSO001')
  })

  it('maps contacts from CustomerID', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('CUST002')
  })

  it('maps totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1500)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('parses OrderDate as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('maps Open status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Open' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'Hold' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
