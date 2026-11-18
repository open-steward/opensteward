import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type TwinfieldSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/salesorder'

function makeSalesOrder(overrides: Partial<TwinfieldSalesOrder> = {}): TwinfieldSalesOrder {
  return {
    code: 'SO-001',
    orderNumber: '2024SO001',
    customer: 'CUST002',
    currency: 'EUR',
    orderDate: '2024-01-15',
    status: 'active',
    totalExcl: 2000,
    totalIncl: 2420,
    vatTotal: 420,
    lines: [],
    office: 'main',
    ...overrides,
  }
}

describe('transformSalesOrder (twinfield)', () => {
  it('maps code to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('SO-001')
  })

  it('maps customer to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('CUST002')
  })

  it('maps totalIncl to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2420)
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps orderDate to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status final to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'final' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status voided to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status deleted to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'deleted' })).status).toBe('CANCELLED')
  })

  it('maps status concept to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makeSalesOrder({
      lines: [
        {
          id: 'line-so-1',
          article: 'SVC-002',
          description: 'Consulting',
          quantity: 1,
          unitsPriceExcl: 2000,
          valueExcl: 2000,
          valueInc: 2420,
          vatCode: 'VH',
          vatValue: 420,
          dim1: 'acc-8050',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-so-1')
    expect(li.itemId).toBe('SVC-002')
    expect(li.totalAmount).toBe(2420)
    expect(li.taxAmount).toBe(420)
    expect(li.accountId).toBe('acc-8050')
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
