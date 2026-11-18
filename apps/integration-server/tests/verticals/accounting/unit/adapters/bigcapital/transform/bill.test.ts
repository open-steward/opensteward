import { describe, it, expect } from 'vitest'
import {
  transformBill,
  untransformBill,
  type BigcapitalBill,
  type BigcapitalBillEntry,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

const sampleEntries: BigcapitalBillEntry[] = [
  { index: 1, itemId: 8, rate: 75, quantity: 3, discount: 10, description: 'Office chairs' },
]

function makeRaw(overrides: Partial<BigcapitalBill> = {}): BigcapitalBill {
  return {
    id: 60,
    billNumber: 'BILL-060',
    billDate: '2024-01-20',
    dueDate: '2024-02-20',
    vendorId: 12,
    currencyCode: 'USD',
    note: 'Office furniture bill',
    referenceNo: 'PO-003',
    entries: sampleEntries,
    isFullyPaid: false,
    isPartiallyPaid: false,
    isOverdue: false,
    total: 225,
    balance: 225,
    paymentAmount: 0,
    taxAmountWithheld: 18,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('60')
    expect(result.billNumber).toBe('BILL-060')
    expect(result.contactId).toBe('12')
    expect(result.currency).toBe('USD')
    // total=225 → toMinor → 22500
    expect(result.totalAmount).toBe(22500)
    expect(result.balanceAmount).toBe(22500)
    // taxAmountWithheld=18 → toMinor → 1800
    expect(result.taxAmount).toBe(1800)
    expect(result.notes).toBe('Office furniture bill')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
    expect(result.dueAt).toEqual(new Date('2024-02-20'))
  })

  it('maps isFullyPaid to PAID', () => {
    const result = transformBill(makeRaw({ isFullyPaid: true }))
    expect(result.status).toBe('PAID')
  })

  it('maps isPartiallyPaid to PARTIALLY_PAID', () => {
    const result = transformBill(makeRaw({ isPartiallyPaid: true }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps isOverdue to OVERDUE', () => {
    const result = transformBill(makeRaw({ isOverdue: true }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps all flags false to AUTHORIZED (bigcapital default)', () => {
    // Note: bigcapital bill has no DRAFT — the default is AUTHORIZED
    const result = transformBill(
      makeRaw({ isFullyPaid: false, isPartiallyPaid: false, isOverdue: false }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps entries to lineItems', () => {
    const result = transformBill(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('8')
    expect(li.itemDescription).toBe('Office chairs')
    // rate=75 → toMinor → 7500
    expect(li.unitAmount).toBe(7500)
    expect(li.unitQuantity).toBe(3)
    // discount=10 → toMinor → 1000
    expect(li.discountAmount).toBe(1000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformBill (contactId, currency, notes)', () => {
    const canonical = transformBill(makeRaw())
    const back = untransformBill(canonical)
    expect(back['vendorId']).toBe(12)
    expect(back['currencyCode']).toBe('USD')
    expect(back['note']).toBe('Office furniture bill')
  })
})
