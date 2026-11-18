import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type CalxaSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeSalesOrder(overrides: Partial<CalxaSalesOrder> = {}): CalxaSalesOrder {
  return {
    id: 'so-001',
    orderNumber: 'SO-001',
    contactId: 'contact-42',
    status: 'completed',
    currency: 'USD',
    total: 650,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id as-is', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-001')
  })

  it('maps contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(650)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformSalesOrder(makeSalesOrder({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status canceled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps undefined status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: undefined })).status).toBe('ACTIVE')
  })

  it('maps createdAt to Date', () => {
    const result = transformSalesOrder(makeSalesOrder({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformSalesOrder(makeSalesOrder({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeSalesOrder()))).not.toThrow()
  })
})
