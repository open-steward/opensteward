import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MekariJurnalCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/creditmemo'

function makeCreditMemo(overrides: Partial<MekariJurnalCreditMemo> = {}): MekariJurnalCreditMemo {
  return {
    id: 300,
    date: '2024-07-15',
    total: 500000,
    person_id: 42,
    status: 'open',
    ...overrides,
  }
}

describe('transformCreditMemo (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('300')
    expect(result.totalAmount).toBe(500000)
    expect(result.contactId).toBe('42')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-07-15'))
  })

  it('maps open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps voided to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps draft/unknown to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null person_id', () => {
    const result = transformCreditMemo(makeCreditMemo({ person_id: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
