import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type CmicCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/creditmemo'

function makeCreditMemo(overrides: Partial<CmicCreditMemo> = {}): CmicCreditMemo {
  return {
    CreditMemoId: 'CM-001',
    CreditMemoNumber: 'CM-2024-001',
    Status: 'Draft',
    VendorId: 'VND-789',
    ProjectCode: 'PRJ-001',
    Currency: 'USD',
    Amount: 2000,
    TaxAmount: 200,
    CreditMemoDate: '2024-03-20',
    Lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (CMiC)', () => {
  it('maps id from CreditMemoId', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('CM-001')
  })

  it('maps core fields', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.creditmemoNumber).toBe('CM-2024-001')
    expect(result.contactId).toBe('VND-789')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(2000)
    expect(result.taxAmount).toBe(200)
  })

  it('parses CreditMemoDate as Date object', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Void' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
