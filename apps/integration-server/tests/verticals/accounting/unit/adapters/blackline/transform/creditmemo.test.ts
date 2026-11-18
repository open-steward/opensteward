import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type BlacklineCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/creditmemo'

function makeCreditMemo(overrides: Partial<BlacklineCreditMemo> = {}): BlacklineCreditMemo {
  return {
    reconciliationId: 'rec-cm-001',
    creditMemoNumber: 'CM-2024-001',
    status: 'Draft',
    accountId: 'acc-123',
    currency: 'USD',
    amount: 300,
    taxAmount: 30,
    postedDate: '2024-03-15',
    createdBy: 'user-1',
    createdAt: '2024-03-15T10:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-15T10:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (BlackLine)', () => {
  it('maps id from reconciliationId', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('rec-cm-001')
  })

  it('maps core fields', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.creditmemoNumber).toBe('CM-2024-001')
    expect(result.contactId).toBe('acc-123')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(300)
    expect(result.taxAmount).toBe(30)
  })

  it('parses postedDate as Date object', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Submitted status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Submitted' })).status).toBe('AUTHORIZED')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
