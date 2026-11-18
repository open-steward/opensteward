import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type LexofficeSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/salesorder'

function makeSalesOrder(overrides: Partial<LexofficeSalesOrder> = {}): LexofficeSalesOrder {
  return {
    id: 'so-uuid-001',
    voucherNumber: 'SO-2024-001',
    voucherDate: '2024-03-01',
    contactId: 'contact-uuid-001',
    totalAmount: 4500,
    currency: 'EUR',
    voucherStatus: 'open',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-uuid-001')
  })

  it('maps contactId correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('contact-uuid-001')
  })

  it('maps currency correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps totalAmount correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(4500)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps voucherStatus draft to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'draft' })).status).toBe('DRAFT')
  })

  it('maps voucherStatus open to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'open' })).status).toBe('ACTIVE')
  })

  it('maps voucherStatus accepted to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps voucherStatus invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps voucherStatus cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps voucherStatus rejected to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'rejected' })).status).toBe('CANCELLED')
  })

  it('maps unknown voucherStatus to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ voucherStatus: 'other' })).status).toBe('DRAFT')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
