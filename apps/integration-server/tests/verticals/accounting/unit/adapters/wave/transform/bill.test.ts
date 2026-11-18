import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type WaveBill,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/bill'

function makeBill(overrides: Partial<WaveBill> = {}): WaveBill {
  return {
    id: 'bill-001',
    billNumber: 'BILL-2024-001',
    vendor: { id: 'vendor-1' },
    currency: { code: 'USD' },
    totalAmount: 5000,
    amountDue: 5000,
    amountPaid: 0,
    dueDate: '2024-04-15',
    invoiceDate: '2024-03-15',
    status: 'SENT',
    createdAt: '2024-03-15T10:00:00Z',
    modifiedAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor-1')
  })

  it('maps currency.code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(5000)
  })

  it('maps amountDue to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(5000)
  })

  it('maps status SENT to SUBMITTED', () => {
    expect(transformBill(makeBill({ status: 'SENT' })).status).toBe('SUBMITTED')
  })

  it('maps status DRAFT to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status PAID to PAID', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps status PARTIAL to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'PARTIAL' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status OVERDUE to OVERDUE', () => {
    expect(transformBill(makeBill({ status: 'OVERDUE' })).status).toBe('OVERDUE')
  })

  it('returns undefined contactId when vendor is null', () => {
    expect(transformBill(makeBill({ vendor: null })).contactId).toBeUndefined()
  })

  it('returns undefined billNumber when billNumber is empty', () => {
    expect(transformBill(makeBill({ billNumber: '' })).billNumber).toBeUndefined()
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps dueDate to dueAt', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-15'))
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
