import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type SimplbooksBill,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<SimplbooksBill> = {}): SimplbooksBill {
  return {
    id: 42,
    number: 'BILL-042',
    supplier_id: 7,
    currency: 'EUR',
    total: 11900,
    total_vat: 1900,
    paid: 0,
    balance: 11900,
    status: 'confirmed',
    invoice_date: '2024-01-15',
    due_date: '2024-02-15',
    paid_date: null,
    notes: 'Office supplies',
    ...overrides,
  }
}

describe('transformBill (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformBill(makeRaw()).id).toBe('42')
  })

  it('maps number to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('BILL-042')
  })

  it('maps supplier_id to contactId string', () => {
    expect(transformBill(makeRaw()).contactId).toBe('7')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(11900)
  })

  it('maps total_vat to taxAmount', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(1900)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformBill(makeRaw()).balanceAmount).toBe(11900)
  })

  it('maps notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Office supplies')
  })

  it('maps invoice_date string to Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps due_date string to Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps confirmed + paid=0 to AUTHORIZED', () => {
    expect(transformBill(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps confirmed + partial paid to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ paid: 5000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps overdue to OVERDUE', () => {
    expect(transformBill(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('passes BillSchema.parse without throwing', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})
