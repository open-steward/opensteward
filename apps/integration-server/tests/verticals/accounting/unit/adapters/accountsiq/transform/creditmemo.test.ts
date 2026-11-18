import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type AccountsIQCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AccountsIQCreditMemo> = {}): AccountsIQCreditMemo {
  return {
    creditNoteId: '6001',
    entityId: '10',
    status: 'Draft',
    creditNoteNumber: 'CN-2024-001',
    creditNoteDate: '2024-03-07',
    totalAmount: 300,
    taxAmount: 50,
    currency: 'EUR',
    contactId: '45',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('6001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('45')
    expect(result.totalAmount).toBe(300)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('EUR')
  })

  it('parses creditNoteDate as postedAt Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-07'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Posted status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Posted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformCreditMemo(makeCreditMemo({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
