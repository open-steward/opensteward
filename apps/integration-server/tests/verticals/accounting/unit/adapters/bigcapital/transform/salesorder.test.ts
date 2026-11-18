import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type BigcapitalSaleEstimate,
  type BigcapitalEstimateEntry,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

const sampleEntries: BigcapitalEstimateEntry[] = [
  { index: 1, itemId: 3, rate: 200, quantity: 2, description: 'Consulting hours' },
]

function makeRaw(overrides: Partial<BigcapitalSaleEstimate> = {}): BigcapitalSaleEstimate {
  return {
    id: 55,
    estimateNumber: 'EST-055',
    estimateDate: '2024-01-10',
    expirationDate: '2024-02-10',
    customerId: 7,
    currencyCode: 'USD',
    note: 'Draft estimate',
    reference: 'REF-002',
    amount: 400,
    entries: sampleEntries,
    deliveredAt: null,
    approvedAt: null,
    rejectedAt: null,
    convertedToInvoiceId: null,
    createdAt: '2024-01-05T00:00:00.000Z',
    updatedAt: '2024-01-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformSalesOrder (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('55')
    expect(result.contactId).toBe('7')
    expect(result.currency).toBe('USD')
    // amount=400 → toMinor → 40000
    expect(result.totalAmount).toBe(40000)
  })

  it('parses estimateDate as postedAt Date', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('maps all null lifecycle flags to DRAFT', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.status).toBe('DRAFT')
  })

  it('maps rejectedAt to CANCELLED', () => {
    const result = transformSalesOrder(makeRaw({ rejectedAt: '2024-01-20' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps convertedToInvoiceId to COMPLETED', () => {
    const result = transformSalesOrder(makeRaw({ convertedToInvoiceId: 99 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps approvedAt to ACTIVE', () => {
    const result = transformSalesOrder(makeRaw({ approvedAt: '2024-01-15' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps deliveredAt to ACTIVE when not rejected or converted', () => {
    const result = transformSalesOrder(makeRaw({ deliveredAt: '2024-01-12' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps entries to lineItems', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    // rate=200 → toMinor → 20000
    expect(result.lineItems![0].unitAmount).toBe(20000)
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes SalesOrderSchema.parse without throwing', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSalesOrder (contactId, currency)', () => {
    const canonical = transformSalesOrder(makeRaw())
    const back = untransformSalesOrder(canonical)
    expect(back['customerId']).toBe(7)
    expect(back['currencyCode']).toBe('USD')
  })
})
