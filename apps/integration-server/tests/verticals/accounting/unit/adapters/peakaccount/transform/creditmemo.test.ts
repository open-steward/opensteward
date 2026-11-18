import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type PeakAccountCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/creditmemo'

function makeCreditMemo(overrides: Partial<PeakAccountCreditMemo> = {}): PeakAccountCreditMemo {
  return {
    id: 'CN-001',
    documentNo: 'CN-2024-001',
    status: 'approved',
    issueDate: '2024-01-20',
    totalAmount: 1070,
    vatAmount: 70,
    currency: 'THB',
    contactId: 'CUST-001',
    items: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('CN-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(1070)
    expect(result.taxAmount).toBe(70)
    expect(result.currency).toBe('THB')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
