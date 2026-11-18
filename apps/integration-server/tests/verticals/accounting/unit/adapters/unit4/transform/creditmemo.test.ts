import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type Unit4CreditMemo } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/creditmemo'

function makeCreditMemo(overrides: Partial<Unit4CreditMemo> = {}): Unit4CreditMemo {
  return {
    creditMemoId: 'cm_001',
    creditMemoNumber: 'CM-2024-001',
    status: 'Draft',
    customerId: 'cust_30',
    amount: 1500,
    taxAmount: 300,
    currencyCode: 'EUR',
    postingDate: '2024-03-20',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Unit4)', () => {
  it('maps creditMemoId to string id', () => {
    expect(transformCreditMemo(makeCreditMemo({ creditMemoId: 'cm_001' })).id).toBe('cm_001')
  })

  it('maps numeric creditMemoId to string', () => {
    expect(transformCreditMemo(makeCreditMemo({ creditMemoId: 15 })).id).toBe('15')
  })

  it('maps creditMemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-2024-001')
  })

  it('maps amount to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo({ amount: 2000 })).totalAmount).toBe(2000)
  })

  it('maps customerId to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo({ customerId: 'cust_55' })).contactId).toBe('cust_55')
  })

  it('maps currencyCode to currency', () => {
    expect(transformCreditMemo(makeCreditMemo({ currencyCode: 'USD' })).currency).toBe('USD')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Posted status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Posted' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('parses postingDate as Date', () => {
    expect(transformCreditMemo(makeCreditMemo({ postingDate: '2024-03-20' })).postedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo({ creditMemoId: 'cm_001' }))
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
