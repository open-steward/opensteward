import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type QBOEstimate,
  type QBOEstimateLine,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/order'

function makeEstimateLine(overrides: Partial<QBOEstimateLine> = {}): QBOEstimateLine {
  return {
    Id: 'line-1',
    Description: 'Consulting services',
    Amount: 500,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: { ItemRef: { value: 'item-1' }, UnitPrice: 250, Qty: 2 },
    ...overrides,
  }
}

function makeEstimate(overrides: Partial<QBOEstimate> = {}): QBOEstimate {
  return {
    Id: 'est-1',
    DocNumber: 'EST-2024-001',
    CustomerRef: { value: 'cust-1' },
    TxnDate: '2024-12-01',
    ExpirationDate: '2025-01-01',
    TotalAmt: 1000,
    TxnStatus: 'Pending',
    CurrencyRef: { value: 'USD' },
    Line: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps Id to id correctly', () => {
    expect(transformOrder(makeEstimate()).id).toBe('est-1')
  })

  it('maps CustomerRef.value to contactId', () => {
    expect(transformOrder(makeEstimate()).contactId).toBe('cust-1')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformOrder(makeEstimate()).currency).toBe('USD')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformOrder(makeEstimate()).totalAmount).toBe(1000)
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeEstimate()).type).toBe('SALES')
  })

  it('parses TxnDate as Date object for postedAt', () => {
    expect(transformOrder(makeEstimate()).postedAt).toEqual(new Date('2024-12-01'))
  })

  it('maps TxnStatus Accepted to COMPLETED', () => {
    expect(transformOrder(makeEstimate({ TxnStatus: 'Accepted' })).status).toBe('COMPLETED')
  })

  it('maps TxnStatus Rejected to CANCELLED', () => {
    expect(transformOrder(makeEstimate({ TxnStatus: 'Rejected' })).status).toBe('CANCELLED')
  })

  it('maps TxnStatus Closed to CANCELLED', () => {
    expect(transformOrder(makeEstimate({ TxnStatus: 'Closed' })).status).toBe('CANCELLED')
  })

  it('maps other TxnStatus values to ACTIVE', () => {
    expect(transformOrder(makeEstimate({ TxnStatus: 'Pending' })).status).toBe('ACTIVE')
    expect(transformOrder(makeEstimate({ TxnStatus: 'Unknown' })).status).toBe('ACTIVE')
  })

  it('maps SalesItemLineDetail lines to lineItems', () => {
    const line = makeEstimateLine()
    const result = transformOrder(makeEstimate({ Line: [line] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({
      id: 'line-1',
      itemId: 'item-1',
      itemDescription: 'Consulting services',
      unitAmount: 250,
      unitQuantity: 2,
      totalAmount: 500,
    })
  })

  it('filters out non-SalesItemLineDetail lines', () => {
    const line = makeEstimateLine({ DetailType: 'SubTotalLineDetail' })
    const result = transformOrder(makeEstimate({ Line: [line] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeEstimate()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeEstimate())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
