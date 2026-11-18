import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type LogoCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/creditmemo'

function makeCreditMemo(overrides: Partial<LogoCreditMemo> = {}): LogoCreditMemo {
  return {
    id: '700',
    Date: '2024-05-01',
    Amount: 1200,
    ContactId: '42',
    Status: 'Authorized',
    CurrencyCode: 'TRY',
    CreditMemoNumber: 'CN-2024-001',
    ...overrides,
  }
}

describe('transformCreditMemo (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('700')
  })

  it('maps creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps totalAmount from Amount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(1200)
  })

  it('maps contactId from ContactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('42')
  })

  it('maps currency from CurrencyCode', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('TRY')
  })

  it('maps Authorized status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('parses date as Date object', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-05-01'))
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
