import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type FoundationCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/creditmemo'

function makeCreditMemo(overrides: Partial<FoundationCreditMemo> = {}): FoundationCreditMemo {
  return {
    CreditMemoNumber: 'CM-001',
    VendorId: 'VEND-42',
    CreditMemoDate: '2024-03-20',
    Amount: 500,
    TaxAmount: 50,
    Currency: 'USD',
    Status: 'Draft',
    Lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('CM-001')
    expect(result.creditmemoNumber).toBe('CM-001')
    expect(result.contactId).toBe('VEND-42')
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Void' })).status).toBe('VOIDED')
  })

  it('returns empty lineItems when Lines is absent', () => {
    const result = transformCreditMemo(makeCreditMemo({ Lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
