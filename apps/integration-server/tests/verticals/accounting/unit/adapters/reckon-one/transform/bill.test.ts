import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type ReckonOneBill,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<ReckonOneBill> = {}): ReckonOneBill {
  return {
    id: 'bill_001',
    billNumber: 'BILL-2024-001',
    supplier: { id: 'supp_001', name: 'Office Supplies Co' },
    date: '2024-03-01',
    dueDate: '2024-04-01',
    totalAmount: 1100.0,
    amountOwing: 550.0,
    currency: 'AUD',
    status: 'AUTHORISED',
    notes: 'Monthly office supplies',
    lines: [
      {
        id: 'line_001',
        accountId: 'acct_exp',
        description: 'Paper reams',
        unitPrice: 10.0,
        quantity: 100,
        amount: 1000.0,
        taxAmount: 100.0,
      },
    ],
    createdDateTime: '2024-02-28T10:00:00Z',
    modifiedDateTime: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeBill()).id).toBe('bill_001')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps supplier.id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supp_001')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('AUD')
  })

  it('converts totalAmount decimal to minor units', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(110000)
  })

  it('converts amountOwing to balanceAmount in minor units', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(55000)
  })

  it('computes paidAmount = totalAmount - amountOwing in minor units', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(55000)
  })

  it('maps notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Monthly office supplies')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps createdDateTime to createdAt', () => {
    expect(transformBill(makeBill()).createdAt).toEqual(new Date('2024-02-28T10:00:00Z'))
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps PAID status to PAID', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('sets status PAID when amountOwing===0', () => {
    expect(transformBill(makeBill({ amountOwing: 0, status: '' })).status).toBe('PAID')
  })

  it('maps VOID/VOIDED status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'VOIDED', amountOwing: 100 })).status).toBe('VOIDED')
  })

  it('sets PARTIALLY_PAID when owing < total and both > 0', () => {
    // makeBill has amountOwing=550 and totalAmount=1100
    expect(transformBill(makeBill()).status).toBe('PARTIALLY_PAID')
  })

  it('maps lines to lineItems with minor unit conversion', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('acct_exp')
    expect(result.lineItems?.[0].unitAmount).toBe(1000)
    expect(result.lineItems?.[0].totalAmount).toBe(100000)
    expect(result.lineItems?.[0].taxAmount).toBe(10000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformBill({ id: 'bill_001' })
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
