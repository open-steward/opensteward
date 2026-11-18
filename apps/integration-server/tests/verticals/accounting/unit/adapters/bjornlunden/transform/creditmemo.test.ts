import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type BlCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/creditmemo'

function makeCreditMemo(overrides: Partial<BlCreditMemo> = {}): BlCreditMemo {
  return {
    Id: 'cm-uuid-1234',
    CreditMemoNumber: 3001,
    CustomerId: 'cust-uuid-5678',
    Currency: 'SEK',
    CreditMemoDate: '2024-03-15',
    DueDate: '2024-04-15',
    TotalAmount: 5000,
    VatAmount: 1000,
    RemainingAmount: 5000,
    PaidAmount: 0,
    Status: 'Approved',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('cm-uuid-1234')
  })

  it('maps creditMemoNumber as string', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.creditmemoNumber).toBe('3001')
  })

  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.contactId).toBe('cust-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(1000)
    expect(result.balanceAmount).toBe(5000)
    expect(result.paidAmount).toBe(0)
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined for missing date fields', () => {
    const result = transformCreditMemo(makeCreditMemo({ CreditMemoDate: '', DueDate: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('maps Draft status', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps PartiallyPaid status', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'PartiallyPaid' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformCreditMemo(makeCreditMemo({ Status: 'Unknown' }))
    expect(result.status).toBe('DRAFT')
  })

  it('returns undefined for empty string fields', () => {
    const result = transformCreditMemo(makeCreditMemo({ CustomerId: '', Currency: '' }))
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
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
