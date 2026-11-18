import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type LexofficeVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/bill'

function makeVoucher(overrides: Partial<LexofficeVoucher> = {}): LexofficeVoucher {
  return {
    id: 'voucher-uuid-001',
    voucherNumber: 'BILL-2024-001',
    voucherDate: '2024-03-01',
    dueDate: '2024-04-01',
    contactId: 'contact-uuid-001',
    totalAmount: 1190,
    openAmount: 1190,
    taxAmount: 190,
    currency: 'EUR',
    voucherStatus: 'open',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeVoucher()).id).toBe('voucher-uuid-001')
  })

  it('maps voucherNumber to billNumber', () => {
    expect(transformBill(makeVoucher()).billNumber).toBe('BILL-2024-001')
  })

  it('maps contactId correctly', () => {
    expect(transformBill(makeVoucher()).contactId).toBe('contact-uuid-001')
  })

  it('maps currency correctly', () => {
    expect(transformBill(makeVoucher()).currency).toBe('EUR')
  })

  it('maps totalAmount correctly', () => {
    expect(transformBill(makeVoucher()).totalAmount).toBe(1190)
  })

  it('maps taxAmount correctly', () => {
    expect(transformBill(makeVoucher()).taxAmount).toBe(190)
  })

  it('maps openAmount to balanceAmount', () => {
    expect(transformBill(makeVoucher()).balanceAmount).toBe(1190)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformBill(makeVoucher()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as Date object for dueAt', () => {
    expect(transformBill(makeVoucher()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps voucherStatus draft to DRAFT', () => {
    expect(transformBill(makeVoucher({ voucherStatus: 'draft' })).status).toBe('DRAFT')
  })

  it('maps voucherStatus open to AUTHORIZED', () => {
    expect(transformBill(makeVoucher({ voucherStatus: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps voucherStatus paid to PAID', () => {
    expect(transformBill(makeVoucher({ voucherStatus: 'paid' })).status).toBe('PAID')
  })

  it('maps voucherStatus paidoff to PAID', () => {
    expect(transformBill(makeVoucher({ voucherStatus: 'paidoff' })).status).toBe('PAID')
  })

  it('maps voucherStatus voided to VOIDED', () => {
    expect(transformBill(makeVoucher({ voucherStatus: 'voided' })).status).toBe('VOIDED')
  })

  it('maps unknown voucherStatus to DRAFT', () => {
    expect(transformBill(makeVoucher({ voucherStatus: 'transferred' })).status).toBe('DRAFT')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeVoucher()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeVoucher())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
