import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type AccurateCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AccurateCreditMemo> = {}): AccurateCreditMemo {
  return {
    id: 8001,
    number: 'CM/2024/001',
    status: 'Open',
    transactionDate: '2024-08-05',
    totalAmount: 1100000,
    customerNo: 'C-001',
    ...overrides,
  }
}

describe('transformCreditMemo (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('8001')
    expect(result.creditmemoNumber).toBe('CM/2024/001')
    expect(result.contactId).toBe('C-001')
    expect(result.totalAmount).toBe(1100000)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-08-05'))
  })

  it('maps Open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Voided to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps unknown to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null customerNo', () => {
    const result = transformCreditMemo(makeCreditMemo({ customerNo: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
