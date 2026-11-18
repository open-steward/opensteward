import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type NetvisorBill,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/bill'

function makeBill(overrides: Partial<NetvisorBill> = {}): NetvisorBill {
  return {
    NetvisorKey: 22001,
    BillNumber: 5001,
    VendorIdentifier: 'VENDOR-1',
    Currency: 'EUR',
    BillDate: '2024-02-01',
    DueDate: '2024-03-01',
    Amount: 5000,
    VatAmount: 1000,
    OpenAmount: 5000,
    PaidAmount: 0,
    Status: 'Open',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformBill(makeBill()).id).toBe('22001')
  })

  it('maps BillNumber to billNumber as string', () => {
    expect(transformBill(makeBill()).billNumber).toBe('5001')
  })

  it('maps VendorIdentifier to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('VENDOR-1')
  })

  it('maps Currency to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5000)
    expect(b.taxAmount).toBe(1000)
    expect(b.balanceAmount).toBe(5000)
  })

  it('maps BillDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps DueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when BillDate is empty', () => {
    expect(transformBill(makeBill({ BillDate: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined contactId when VendorIdentifier is empty', () => {
    expect(transformBill(makeBill({ VendorIdentifier: '' })).contactId).toBeUndefined()
  })

  it('maps status Open to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'Open' })).status).toBe('DRAFT')
  })

  it('maps status Approved to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps status Paid to PAID', () => {
    expect(transformBill(makeBill({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps status Cancelled to VOIDED', () => {
    expect(transformBill(makeBill({ Status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'Unknown' })).status).toBe('DRAFT')
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
