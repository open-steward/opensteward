import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type SevDeskVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/bill'

function makeBill(overrides: Partial<SevDeskVoucher> = {}): SevDeskVoucher {
  return {
    id: 'vou-1',
    voucherNumber: 'VOU-2024-001',
    supplier: { id: 'sup-1', objectName: 'Contact' },
    voucherDate: '2024-03-01',
    payDate: null,
    currency: 'EUR',
    sumNet: '1000.00',
    sumGross: '1190.00',
    sumTax: '190.00',
    sumDiscounts: '0.00',
    status: '100',
    voucherType: 'VOU',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeBill()).id).toBe('vou-1')
  })

  it('maps voucherNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('VOU-2024-001')
  })

  it('maps supplier id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('sup-1')
  })

  it('maps currency correctly', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1190)
  })

  it('parses sumTax as taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(190)
  })

  it('parses voucherDate as Date object', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps payDate to paidAt as Date object', () => {
    const b = transformBill(makeBill({ payDate: '2024-03-20' }))
    expect(b.paidAt).toEqual(new Date('2024-03-20'))
  })

  it('maps status 100 to DRAFT', () => {
    expect(transformBill(makeBill({ status: '100' })).status).toBe('DRAFT')
  })

  it('maps status 200 without payDate to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: '200', payDate: null })).status).toBe('AUTHORIZED')
  })

  it('maps status 200 with payDate to PAID', () => {
    expect(transformBill(makeBill({ status: '200', payDate: '2024-03-20' })).status).toBe('PAID')
  })

  it('maps status 1000 to VOIDED', () => {
    expect(transformBill(makeBill({ status: '1000' })).status).toBe('VOIDED')
  })

  it('handles null supplier', () => {
    expect(transformBill(makeBill({ supplier: null })).contactId).toBeUndefined()
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
