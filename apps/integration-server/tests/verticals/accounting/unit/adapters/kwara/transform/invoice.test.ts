import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type KwaraLoan } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/invoice'

function makeRaw(overrides: Partial<KwaraLoan> = {}): KwaraLoan {
  return {
    id: 'loan-001',
    loan_number: 'LN-001',
    disbursed_date: '2024-01-15',
    due_date: '2025-01-15',
    amount: 10000,
    accrued_interest: 500,
    total_balance: 10500,
    state: 'active',
    member_id: 'mem-123',
    ...overrides,
  }
}

describe('transformInvoice (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformInvoice(makeRaw())
    expect(r.id).toBe('loan-001')
    expect(r.type).toBe('INVOICE')
    expect(r.invoiceNumber).toBe('LN-001')
    expect(r.contactId).toBe('mem-123')
    expect(r.totalAmount).toBe(10500)
    expect(r.taxAmount).toBe(500)
    expect(r.balanceAmount).toBe(10500)
  })

  it('parses dates as Date objects', () => {
    const r = transformInvoice(makeRaw())
    expect(r.postedAt).toEqual(new Date('2024-01-15'))
    expect(r.dueAt).toEqual(new Date('2025-01-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps active state to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ state: 'active' })).status).toBe('AUTHORIZED')
  })

  it('maps closed state to PAID', () => {
    expect(transformInvoice(makeRaw({ state: 'closed' })).status).toBe('PAID')
  })

  it('maps written_off state to VOIDED', () => {
    expect(transformInvoice(makeRaw({ state: 'written_off' })).status).toBe('VOIDED')
  })

  it('maps pending state to DRAFT', () => {
    expect(transformInvoice(makeRaw({ state: 'pending' })).status).toBe('DRAFT')
  })

  it('defaults unknown state to DRAFT', () => {
    expect(transformInvoice(makeRaw({ state: 'unknown' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
