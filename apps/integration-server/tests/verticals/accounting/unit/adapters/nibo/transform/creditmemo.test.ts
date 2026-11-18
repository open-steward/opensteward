import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type NiboCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/creditmemo'

function makeRaw(overrides: Partial<NiboCreditMemo> = {}): NiboCreditMemo {
  return {
    creditMemoId: 1,
    documentNumber: 'NC-001',
    customerId: 5,
    issueDate: '2024-02-01',
    dueDate: '2024-03-01',
    totalValue: 500,
    taxValue: 80,
    balance: 500,
    paidValue: 0,
    currencyCode: 'BRL',
    status: 'Pending',
    isCancelled: false,
    items: [],
    ...overrides,
  }
}

describe('nibo transformCreditMemo', () => {
  it('maps creditMemoId to id as string', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
  it('maps isCancelled true -> VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ isCancelled: true })).status).toBe('VOIDED')
  })
  it('maps Paid status -> PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })
  it('maps issueDate to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
