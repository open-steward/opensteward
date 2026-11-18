import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type CertiniaCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/creditmemo'

function makeCreditMemo(overrides: Partial<CertiniaCreditMemo> = {}): CertiniaCreditMemo {
  return {
    Id: 'CM0000000001',
    Name: 'CM-2024-001',
    Status__c: 'Draft',
    Credit_Date__c: '2024-03-20',
    Amount__c: 750,
    Tax_Amount__c: 75,
    Currency__c: 'USD',
    Account__c: 'ACCT-001',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformCreditMemo (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('CM0000000001')
    expect(result.creditmemoNumber).toBe('CM-2024-001')
    expect(result.contactId).toBe('ACCT-001')
    expect(result.totalAmount).toBe(750)
    expect(result.taxAmount).toBe(75)
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
    expect(transformCreditMemo(makeCreditMemo({ Status__c: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status__c: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status__c: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    expect(transformCreditMemo(makeCreditMemo({ Lines__r: null })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
