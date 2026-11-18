import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type QBOBill,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/bill'

function makeBill(overrides: Partial<QBOBill> = {}): QBOBill {
  return {
    Id: '120',
    DocNumber: 'BILL-001',
    VendorRef: { value: '50', name: 'Vendor Co' },
    TxnDate: '2024-02-15',
    DueDate: '2024-03-15',
    TotalAmt: 4000,
    Balance: 4000,
    CurrencyRef: { value: 'USD' },
    Line: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps Id to id', () => {
    expect(transformBill(makeBill()).id).toBe('120')
  })

  it('maps DocNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps VendorRef.value to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('50')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(4000)
  })

  it('maps Balance to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(4000)
  })

  it('parses TxnDate as postedAt Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-15'))
  })

  it('parses DueDate as dueAt Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-15'))
  })

  it('maps AUTHORIZED status when Balance equals TotalAmt and not overdue', () => {
    const futureDate = new Date(Date.now() + 86400 * 1000 * 30).toISOString().split('T')[0]
    expect(transformBill(makeBill({ DueDate: futureDate })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status when Balance is zero', () => {
    expect(transformBill(makeBill({ Balance: 0 })).status).toBe('PAID')
  })

  it('maps PARTIALLY_PAID status when Balance is partial', () => {
    expect(transformBill(makeBill({ Balance: 2000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps OVERDUE status when Balance equals total and DueDate is past', () => {
    expect(transformBill(makeBill({ DueDate: '2020-01-01' })).status).toBe('OVERDUE')
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
