import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type TwinfieldCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/creditmemo'

function makeCreditMemo(overrides: Partial<TwinfieldCreditMemo> = {}): TwinfieldCreditMemo {
  return {
    code: 'CM-001',
    creditNumber: 'CN-2024-001',
    customer: 'DEB-001',
    currency: 'EUR',
    invoiceDate: '2024-06-20',
    dueDate: '2024-07-20',
    status: 'final',
    totalExcl: 1000,
    totalIncl: 1210,
    vatTotal: 210,
    paidAmount: 0,
    balance: 1210,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps code to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('CM-001')
  })

  it('maps creditNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps customer to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('DEB-001')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps totalIncl to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(1210)
  })

  it('maps vatTotal to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(210)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(1210)
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-06-20'))
  })

  it('maps dueDate to dueAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-07-20'))
  })

  it('maps status AUTHORIZED when final with full balance', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'final', balance: 1210, paidAmount: 0 }))
        .status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when final and balance is zero', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'final', balance: 0 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when final with partial payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'final', balance: 600, paidAmount: 610 }))
        .status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status DRAFT when concept', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
