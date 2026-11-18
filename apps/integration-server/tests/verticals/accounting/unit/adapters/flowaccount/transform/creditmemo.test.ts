import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type FlowAccountCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/creditmemo'

function makeCreditMemo(overrides: Partial<FlowAccountCreditMemo> = {}): FlowAccountCreditMemo {
  return {
    id: 900,
    date: '2024-01-20',
    statusId: 2,
    amountTotal: 1070,
    vatTotal: 70,
    contactCode: 'CUST-001',
    currencyCode: 'THB',
    items: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('900')
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

  it('maps statusId 1 to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ statusId: 1 })).status).toBe('DRAFT')
  })

  it('maps statusId 2 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ statusId: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps statusId 3 to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ statusId: 3 })).status).toBe('PAID')
  })

  it('maps statusId 4 to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ statusId: 4 })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
