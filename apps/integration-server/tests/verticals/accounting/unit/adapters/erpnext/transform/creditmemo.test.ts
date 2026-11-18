import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ErpNextCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/creditmemo'

function makeRaw(overrides: Partial<ErpNextCreditMemo> = {}): ErpNextCreditMemo {
  return {
    name: 'SRET-2024-00001',
    posting_date: '2024-01-25',
    due_date: '2024-02-25',
    base_grand_total: 600,
    base_total_taxes_and_charges: 100,
    outstanding_amount: 600,
    status: 'Submitted',
    currency: 'USD',
    customer: 'ACME Corp',
    remarks: 'Return credit',
    is_return: 1,
    items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('SRET-2024-00001')
    expect(result.contactId).toBe('ACME Corp')
    expect(result.totalAmount).toBe(600)
    expect(result.taxAmount).toBe(100)
    expect(result.currency).toBe('USD')
  })

  it('maps status Draft to DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps status Submitted to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'Submitted' })).status).toBe('AUTHORIZED')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-25'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
