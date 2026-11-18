import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformBill,
  type CrunchBillDto,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<CrunchBillDto> = {}): CrunchBillDto {
  return {
    id: 55,
    status: 'APPROVED',
    supplier: { id: 12, companyName: 'Staples Ltd' },
    note: 'Office supplies invoice',
    expenseLineItems: [
      {
        id: 1,
        description: 'Paper reams',
        amount: { grossAmount: 100, netAmount: 83.33, vatAmount: 16.67 },
      },
    ],
    supplierPayments: [
      {
        id: 1,
        date: '2026-03-25',
        amount: 50,
        paymentTarget: { paymentMethod: { paymentMethodName: 'BACS' } },
      },
    ],
    postingDate: '2026-03-20',
    outstandingBalance: 50,
    ...overrides,
  }
}

describe('transformBill (crunch)', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill()).id).toBe('55')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps DRAFT status', () => {
    expect(transformBill(makeBill({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('prefixes supplier id with sup_', () => {
    expect(transformBill(makeBill()).contactId).toBe('sup_12')
  })

  it('converts line item grossAmount (float) to minor units', () => {
    // grossAmount=100 → 10000 pence
    expect(transformBill(makeBill()).totalAmount).toBe(10000)
  })

  it('converts line item vatAmount to taxAmount in minor units', () => {
    // vatAmount=16.67 → 1667 pence
    expect(transformBill(makeBill()).taxAmount).toBe(1667)
  })

  it('converts supplier payment amount to paidAmount in minor units', () => {
    // payment=50 → 5000 pence
    expect(transformBill(makeBill()).paidAmount).toBe(5000)
  })

  it('converts outstandingBalance to balanceAmount in minor units', () => {
    // outstandingBalance=50 → 5000 pence
    expect(transformBill(makeBill()).balanceAmount).toBe(5000)
  })

  it('maps notes from note field', () => {
    expect(transformBill(makeBill()).notes).toBe('Office supplies invoice')
  })

  it('parses postingDate as postedAt', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-03-20')).toBe(true)
  })

  it('sets paidAt to the latest payment date', () => {
    const result = transformBill(makeBill())
    expect(result.paidAt).toBeInstanceOf(Date)
    expect(result.paidAt!.toISOString().startsWith('2026-03-25')).toBe(true)
  })

  it('attaches raw as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
