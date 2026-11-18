import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type TwinfieldBill,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/bill'

function makeBill(overrides: Partial<TwinfieldBill> = {}): TwinfieldBill {
  return {
    code: 'PINV-001',
    billNumber: 'BILL-2024-050',
    supplier: 'CRE-010',
    currency: 'EUR',
    invoiceDate: '2024-05-15',
    dueDate: '2024-06-15',
    status: 'final',
    totalExcl: 4000,
    totalIncl: 4840,
    vatTotal: 840,
    paidAmount: 0,
    balance: 4840,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps code to id', () => {
    expect(transformBill(makeBill()).id).toBe('PINV-001')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-050')
  })

  it('maps supplier to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('CRE-010')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps totalIncl to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(4840)
  })

  it('maps vatTotal to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(840)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(4840)
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-05-15'))
  })

  it('maps dueDate to dueAt', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-06-15'))
  })

  it('returns undefined postedAt when invoiceDate is empty', () => {
    expect(transformBill(makeBill({ invoiceDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status AUTHORIZED when final with full balance', () => {
    expect(transformBill(makeBill({ status: 'final', balance: 4840, paidAmount: 0 })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps status PAID when final and balance is zero', () => {
    expect(transformBill(makeBill({ status: 'final', balance: 0 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when final with partial payment', () => {
    expect(
      transformBill(makeBill({ status: 'final', balance: 2000, paidAmount: 2840 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status DRAFT when concept', () => {
    expect(transformBill(makeBill({ status: 'concept' })).status).toBe('DRAFT')
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
