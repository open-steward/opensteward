import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type DualentryCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeRaw(overrides: Partial<DualentryCreditNote> = {}): DualentryCreditNote {
  return {
    id: 30,
    number: 3001,
    company_id: 1,
    customer_id: 10,
    customer_name: 'Acme Corp',
    currency_iso_4217_code: 'EUR',
    amount: '50.00',
    amount_due: '50.00',
    paid_total: '0.00',
    date: '2024-04-01',
    due_date: '2024-05-01',
    memo: 'Defective product return',
    reference_number: 'CN-001',
    record_status: 'draft',
    items: [],
    ...overrides,
  }
}

describe('dualentry transformCreditMemo', () => {
  it('maps id to string', () => {
    const result = transformCreditMemo(makeRaw({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('maps customer_id with cust_ prefix to contactId', () => {
    const result = transformCreditMemo(makeRaw({ customer_id: 10 }))
    expect(result.contactId).toBe('cust_10')
  })

  it('maps number to creditmemoNumber as string', () => {
    const result = transformCreditMemo(makeRaw({ number: 555 }))
    expect(result.creditmemoNumber).toBe('555')
  })

  it('amount string → minor units', () => {
    const result = transformCreditMemo(makeRaw({ amount: '24.50' }))
    expect(result.totalAmount).toBe(2450)
  })

  it('record_status=archived → VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ record_status: 'archived' }))
    expect(result.status).toBe('VOIDED')
  })

  it('posted + paid>0 + due=0 → PAID', () => {
    const result = transformCreditMemo(
      makeRaw({ record_status: 'posted', paid_total: '50.00', amount_due: '0.00' }),
    )
    expect(result.status).toBe('PAID')
  })

  it('draft → DRAFT', () => {
    const result = transformCreditMemo(makeRaw({ record_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
