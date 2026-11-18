import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ProsvasisCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ProsvasisCreditMemo> = {}): ProsvasisCreditMemo {
  return {
    id: '5001',
    SeriesNumber: 'CN-2024-001',
    Status: 'Draft',
    Date: '2024-03-20',
    TotalAmount: 248,
    VatAmount: 48,
    Currency: 'EUR',
    CustomerId: '50',
    Lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('5001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('50')
    expect(result.totalAmount).toBe(248)
    expect(result.taxAmount).toBe(48)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('maps Draft to DRAFT', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Issued to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Issued' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid to PAID', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Cancelled to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Cancelled' }))
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
