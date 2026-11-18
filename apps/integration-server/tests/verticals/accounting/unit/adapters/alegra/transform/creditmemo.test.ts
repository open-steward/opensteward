import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type AlegraCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AlegraCreditMemo> = {}): AlegraCreditMemo {
  return {
    id: 20,
    numberTemplate: { number: '005', prefix: 'NC-' },
    date: '2024-01-15',
    dueDate: '2024-02-15',
    clientId: 3,
    total: 5000,
    totalTax: 800,
    balance: 5000,
    paidAmount: 0,
    currency: 'COP',
    status: 'open',
    items: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id to string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('20')
  })

  it('maps numberTemplate to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('NC-005')
  })

  it('maps clientId to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('3')
  })

  it('maps amounts', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(800)
    expect(result.balanceAmount).toBe(5000)
  })

  it('maps status DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED for open', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED for voided', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps dates as Date objects', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
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
