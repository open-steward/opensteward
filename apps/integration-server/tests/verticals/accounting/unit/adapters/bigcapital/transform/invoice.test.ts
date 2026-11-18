import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type BigcapitalInvoice,
  type BigcapitalInvoiceEntry,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

const sampleEntries: BigcapitalInvoiceEntry[] = [
  { index: 1, itemId: 10, rate: 50, quantity: 2, discount: 5, description: 'Widget A' },
]

function makeRaw(overrides: Partial<BigcapitalInvoice> = {}): BigcapitalInvoice {
  return {
    id: 42,
    invoiceNo: 'INV-042',
    invoiceDate: '2024-01-15',
    dueDate: '2024-02-15',
    customerId: 7,
    currencyCode: 'USD',
    invoiceMessage: 'Thank you for your business',
    referenceNo: 'PO-001',
    entries: sampleEntries,
    isFullyPaid: false,
    isPartiallyPaid: false,
    isOverdue: false,
    delivered: false,
    total: 100,
    balance: 100,
    paymentAmount: 0,
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('42')
    expect(result.invoiceNumber).toBe('INV-042')
    expect(result.contactId).toBe('7')
    expect(result.currency).toBe('USD')
    // total=100 → toMinor → 10000
    expect(result.totalAmount).toBe(10000)
    expect(result.balanceAmount).toBe(10000)
    expect(result.type).toBe('INVOICE')
    expect(result.notes).toBe('Thank you for your business')
    expect(result.reference).toBe('PO-001')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00.000Z'))
  })

  it('maps isFullyPaid to PAID', () => {
    const result = transformInvoice(makeRaw({ isFullyPaid: true }))
    expect(result.status).toBe('PAID')
  })

  it('maps isPartiallyPaid to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ isPartiallyPaid: true }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps isOverdue to OVERDUE', () => {
    const result = transformInvoice(makeRaw({ isOverdue: true }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps delivered=true to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ delivered: true }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps all flags false to DRAFT', () => {
    const result = transformInvoice(
      makeRaw({ isFullyPaid: false, isPartiallyPaid: false, isOverdue: false, delivered: false }),
    )
    expect(result.status).toBe('DRAFT')
  })

  it('maps entries to lineItems', () => {
    const result = transformInvoice(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('10')
    expect(li.itemDescription).toBe('Widget A')
    // rate=50 → toMinor → 5000
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    // discount=5 → toMinor → 500
    expect(li.discountAmount).toBe(500)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice (contactId, currency, notes)', () => {
    const canonical = transformInvoice(makeRaw())
    const back = untransformInvoice(canonical)
    expect(back['customerId']).toBe(7)
    expect(back['currencyCode']).toBe('USD')
    expect(back['invoiceMessage']).toBe('Thank you for your business')
  })
})
