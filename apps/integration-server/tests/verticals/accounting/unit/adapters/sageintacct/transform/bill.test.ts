import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type IntacctBill,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/bill'

function makeBill(overrides: Partial<IntacctBill> = {}): IntacctBill {
  return {
    RECORDNO: 'bill-1',
    RECORDID: 'BILL-2024-001',
    VENDORID: 'vendor-1',
    TOTALENTERED: '1000.00',
    TOTALPAID: '0.00',
    TOTALDUE: '1000.00',
    CURRENCY: 'USD',
    WHENCREATED: '2024-03-01',
    WHENDUE: '2024-04-01',
    STATE: 'Posted',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps RECORDNO to id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-1')
  })

  it('maps RECORDID to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps VENDORID to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('parses TOTALENTERED as totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1000)
  })

  it('parses TOTALPAID as paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(0)
  })

  it('parses TOTALDUE as balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(1000)
  })

  it('parses WHENCREATED as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses WHENDUE as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps STATE Draft to DRAFT', () => {
    expect(transformBill(makeBill({ STATE: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps STATE Posted with full balance due to AUTHORIZED', () => {
    expect(
      transformBill(makeBill({ STATE: 'Posted', TOTALPAID: '0.00', TOTALDUE: '1000.00' })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps STATE Posted with zero due to PAID', () => {
    expect(
      transformBill(makeBill({ STATE: 'Posted', TOTALPAID: '1000.00', TOTALDUE: '0.00' })).status,
    ).toBe('PAID')
  })

  it('maps STATE Posted with partial payment to PARTIALLY_PAID', () => {
    expect(
      transformBill(makeBill({ STATE: 'Posted', TOTALPAID: '400.00', TOTALDUE: '600.00' })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps STATE Paid to PAID', () => {
    expect(transformBill(makeBill({ STATE: 'Paid' })).status).toBe('PAID')
  })

  it('maps STATE Reversed to VOIDED', () => {
    expect(transformBill(makeBill({ STATE: 'Reversed' })).status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
