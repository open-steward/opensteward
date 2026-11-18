import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type FreshBooksEstimate,
  type FreshBooksEstimateLine,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/order'

function makeEstimateLine(overrides: Partial<FreshBooksEstimateLine> = {}): FreshBooksEstimateLine {
  return {
    lineid: 1,
    name: 'Service',
    description: 'Consulting service',
    unit_cost: { amount: '200.00', code: 'USD' },
    qty: '3',
    amount: { amount: '600.00', code: 'USD' },
    ...overrides,
  }
}

function makeEstimate(overrides: Partial<FreshBooksEstimate> = {}): FreshBooksEstimate {
  return {
    id: 400,
    client_id: 55,
    estimate_number: 'EST-2024-001',
    date: '2024-03-01',
    expiry_date: '2024-04-01',
    currency_code: 'USD',
    amount: { amount: '600.00', code: 'USD' },
    status: 2,
    lines: [makeEstimateLine()],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformOrder(makeEstimate()).id).toBe('400')
  })

  it('maps client_id to contactId', () => {
    expect(transformOrder(makeEstimate()).contactId).toBe('55')
  })

  it('maps currency_code to currency', () => {
    expect(transformOrder(makeEstimate()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformOrder(makeEstimate()).totalAmount).toBe(600)
  })

  it('parses date as Date object for postedAt', () => {
    expect(transformOrder(makeEstimate()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeEstimate()).type).toBe('SALES')
  })

  it('maps status 1 to DRAFT', () => {
    expect(transformOrder(makeEstimate({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps status 2 to ACTIVE', () => {
    expect(transformOrder(makeEstimate({ status: 2 })).status).toBe('ACTIVE')
  })

  it('maps status 3 to ACTIVE', () => {
    expect(transformOrder(makeEstimate({ status: 3 })).status).toBe('ACTIVE')
  })

  it('maps status 4 to ACTIVE', () => {
    expect(transformOrder(makeEstimate({ status: 4 })).status).toBe('ACTIVE')
  })

  it('maps status 5 to COMPLETED', () => {
    expect(transformOrder(makeEstimate({ status: 5 })).status).toBe('COMPLETED')
  })

  it('maps status 6 to CANCELLED', () => {
    expect(transformOrder(makeEstimate({ status: 6 })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeEstimate({ status: 99 })).status).toBe('ACTIVE')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeEstimate())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].totalAmount).toBe(600)
    expect(result.lineItems![0].unitQuantity).toBe(3)
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
