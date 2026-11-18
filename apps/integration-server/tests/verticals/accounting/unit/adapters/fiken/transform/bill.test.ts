import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type FikenBill,
  type FikenBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/bill'

function makeBillLine(overrides: Partial<FikenBillLine> = {}): FikenBillLine {
  return {
    netPrice: 4000,
    vatAmount: 1000,
    grossPrice: 5000,
    description: 'Office supplies',
    accountCode: '4300',
    vatType: 'HIGH',
    ...overrides,
  }
}

function makeBill(overrides: Partial<FikenBill> = {}): FikenBill {
  return {
    purchaseId: 201,
    identifier: 'BILL-2001',
    supplierId: 77,
    currency: 'NOK',
    net: 8000,
    vat: 2000,
    gross: 10000,
    date: '2024-05-10',
    dueDate: '2024-06-10',
    paid: false,
    settled: false,
    lines: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps purchaseId to id as string', () => {
    expect(transformBill(makeBill()).id).toBe('201')
  })

  it('maps identifier to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2001')
  })

  it('maps supplierId to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('77')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('NOK')
  })

  it('maps gross to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(10000)
  })

  it('maps vat to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(2000)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-05-10'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-06-10'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformBill(makeBill({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status AUTHORIZED when not paid and not settled', () => {
    expect(transformBill(makeBill({ paid: false, settled: false })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when settled', () => {
    expect(transformBill(makeBill({ settled: true })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when paid but not settled', () => {
    expect(transformBill(makeBill({ paid: true, settled: false })).status).toBe('PARTIALLY_PAID')
  })

  it('maps lines to lineItems', () => {
    const raw = makeBill({ lines: [makeBillLine()] })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemDescription).toBe('Office supplies')
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(1000)
    expect(li.accountId).toBe('4300')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
