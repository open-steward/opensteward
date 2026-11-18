import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MoloniCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/creditmemo'

function makeCreditMemo(overrides: Partial<MoloniCreditMemo> = {}): MoloniCreditMemo {
  return {
    document_id: 300,
    date: '2024-05-01',
    net_value: 200,
    client_id: 42,
    status: 0,
    taxes: [],
    currency_code: 'EUR',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('300')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(200)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo({ net_value: 999 })
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 2 })).status).toBe('VOIDED')
  })

  it('sums taxes for taxAmount', () => {
    const result = transformCreditMemo(makeCreditMemo({ taxes: [{ value: 20 }, { value: 10 }] }))
    expect(result.taxAmount).toBe(30)
  })

  it('maps client_id 0 to undefined contactId', () => {
    const result = transformCreditMemo(makeCreditMemo({ client_id: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
