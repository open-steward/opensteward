import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type PowerOfficeBill,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/bill'

function makeBill(overrides: Partial<PowerOfficeBill> = {}): PowerOfficeBill {
  return {
    id: 42,
    supplierId: 7,
    invoiceDate: '2024-03-01',
    dueDate: '2024-03-31',
    currencyCode: 'NOK',
    grossAmount: 1190,
    netAmount: 1000,
    vatAmount: 190,
    isPaid: false,
    isVoid: false,
    status: 5,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeBill()).id).toBe('42')
  })

  it('maps supplierId to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('7')
  })

  it('maps currencyCode to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1190)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(190)
  })

  it('parses invoiceDate as Date object for postedAt', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as Date object for dueAt', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps isVoid true to VOIDED', () => {
    expect(transformBill(makeBill({ isVoid: true, isPaid: true, status: 5 })).status).toBe('VOIDED')
  })

  it('maps isPaid true (not void) to PAID', () => {
    expect(transformBill(makeBill({ isVoid: false, isPaid: true, status: 5 })).status).toBe('PAID')
  })

  it('maps status 5 (not paid, not void) to AUTHORIZED', () => {
    expect(transformBill(makeBill({ isVoid: false, isPaid: false, status: 5 })).status).toBe('AUTHORIZED')
  })

  it('maps status 0 (not paid, not void) to DRAFT', () => {
    expect(transformBill(makeBill({ isVoid: false, isPaid: false, status: 0 })).status).toBe('DRAFT')
  })

  it('maps other status (not paid, not void) to AUTHORIZED', () => {
    expect(transformBill(makeBill({ isVoid: false, isPaid: false, status: 3 })).status).toBe('AUTHORIZED')
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
