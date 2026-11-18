import { describe, it, expect } from 'vitest'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/creditmemo'
import type { FakturowniaInvoice } from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeRaw(overrides: Partial<FakturowniaInvoice> = {}): FakturowniaInvoice {
  return {
    id: 3001,
    number: 'CORR/2024/001',
    status: 'issued',
    issue_date: '2024-06-01',
    payment_to: '2024-07-01',
    currency: 'PLN',
    price_gross: 50.0,
    price_tax: 9.35,
    price_net: 40.65,
    paid: 0,
    client_id: 10,
    correction_reason: 'Defective goods returned',
    positions: [],
    ...overrides,
  }
}

describe('fakturownia transformCreditMemo', () => {
  it('maps id to string', () => {
    const result = transformCreditMemo(makeRaw({ id: 555 }))
    expect(result.id).toBe('555')
  })

  it('maps number to creditmemoNumber', () => {
    const result = transformCreditMemo(makeRaw({ number: 'CORR-10' }))
    expect(result.creditmemoNumber).toBe('CORR-10')
  })

  it('maps client_id to contactId as string', () => {
    const result = transformCreditMemo(makeRaw({ client_id: 10 }))
    expect(result.contactId).toBe('10')
  })

  it('major-unit price_gross → minor units', () => {
    const result = transformCreditMemo(makeRaw({ price_gross: 50 }))
    expect(result.totalAmount).toBe(5000)
  })

  it('maps correction_reason to refundReason', () => {
    const result = transformCreditMemo(makeRaw({ correction_reason: 'Wrong item' }))
    expect(result.refundReason).toBe('Wrong item')
  })

  it('status paid → PAID', () => {
    const result = transformCreditMemo(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('status rejected → VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('status issued → AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'issued' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps issue_date to postedAt as Date', () => {
    const result = transformCreditMemo(makeRaw({ issue_date: '2024-06-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
