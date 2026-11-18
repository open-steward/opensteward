import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type GustoCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/creditmemo'

function makeCreditMemo(overrides: Partial<GustoCreditMemo> = {}): GustoCreditMemo {
  return {
    id: 'cm_001',
    status: 'draft',
    date: '2024-03-01',
    employee_id: 'emp_42',
    total_amount: 500,
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformCreditMemo(makeCreditMemo({ id: 'cm_001' })).id).toBe('cm_001')
  })

  it('maps numeric id to string', () => {
    expect(transformCreditMemo(makeCreditMemo({ id: 10 })).id).toBe('10')
  })

  it('maps total_amount', () => {
    expect(transformCreditMemo(makeCreditMemo({ total_amount: 750 })).totalAmount).toBe(750)
  })

  it('maps employee_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo({ employee_id: 'emp_55' })).contactId).toBe('emp_55')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo({ currency: 'CAD' })).currency).toBe('CAD')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps applied status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'applied' })).status).toBe('AUTHORIZED')
  })

  it('maps void status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('parses date as Date object', () => {
    expect(transformCreditMemo(makeCreditMemo({ date: '2024-03-01' })).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo({ id: 'cm_001' }))
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
