import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type EpsilonNetCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/creditmemo'

function makeCreditMemo(overrides: Partial<EpsilonNetCreditMemo> = {}): EpsilonNetCreditMemo {
  return {
    id: '5001',
    invoiceNumber: 'CN-2024-001',
    status: 'Draft',
    issueDate: '2024-03-20',
    totalNetValue: 200,
    totalVatAmount: 48,
    totalGrossValue: 248,
    currency: 'EUR',
    counterpart: { vatNumber: 'EL999888777' },
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('5001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('EL999888777')
    expect(result.totalAmount).toBe(248)
    expect(result.taxAmount).toBe(48)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('maps Draft to DRAFT', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Submitted to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Submitted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Cancelled to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
