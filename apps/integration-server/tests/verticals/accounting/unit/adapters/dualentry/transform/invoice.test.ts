import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type DualentryInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<DualentryInvoice> = {}): DualentryInvoice {
  return {
    id: 100,
    internal_id: 100,
    number: 2001,
    company_id: 1,
    company_name: 'My Company',
    company_currency: 'EUR',
    customer_id: 10,
    customer_name: 'Acme Corp',
    currency_iso_4217_code: 'EUR',
    exchange_rate: '1.00',
    amount: '121.00',
    amount_due: '121.00',
    paid_total: '0.00',
    date: '2024-03-01',
    transaction_date: '2024-03-01',
    due_date: '2024-04-01',
    memo: 'Consulting services',
    reference_number: 'INV-2024-001',
    record_status: 'draft',
    approval_status: null,
    items: [],
    ...overrides,
  }
}

describe('dualentry transformInvoice', () => {
  it('maps id to string id', () => {
    const result = transformInvoice(makeRaw({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('type is always INVOICE', () => {
    const result = transformInvoice(makeRaw())
    expect(result.type).toBe('INVOICE')
  })

  it('maps customer_id with cust_ prefix to contactId', () => {
    const result = transformInvoice(makeRaw({ customer_id: 10 }))
    expect(result.contactId).toBe('cust_10')
  })

  it('amount string → minor units', () => {
    const result = transformInvoice(makeRaw({ amount: '12.34' }))
    expect(result.totalAmount).toBe(1234)
  })

  it('record_status=archived → VOIDED', () => {
    const result = transformInvoice(makeRaw({ record_status: 'archived' }))
    expect(result.status).toBe('VOIDED')
  })

  it('posted + paid>0 + due=0 → PAID', () => {
    const result = transformInvoice(
      makeRaw({ record_status: 'posted', paid_total: '121.00', amount_due: '0.00' }),
    )
    expect(result.status).toBe('PAID')
  })

  it('posted + no payment → AUTHORIZED', () => {
    const result = transformInvoice(
      makeRaw({ record_status: 'posted', paid_total: '0.00', amount_due: '121.00' }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('draft → DRAFT', () => {
    const result = transformInvoice(makeRaw({ record_status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('taxAmount is always undefined', () => {
    // DualEntry does not map taxAmount at invoice level
    const result = transformInvoice(makeRaw())
    expect(result.taxAmount).toBeUndefined()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('dualentry untransformInvoice', () => {
  it('strips cust_ prefix from contactId', () => {
    const result = untransformInvoice({ contactId: 'cust_42' })
    expect(result.customer_id).toBe(42)
  })

  it('maps currency', () => {
    const result = untransformInvoice({ currency: 'PLN' })
    expect(result.currency_iso_4217_code).toBe('PLN')
  })

  it('DRAFT status maps to draft record_status', () => {
    const result = untransformInvoice({ status: 'DRAFT' })
    expect(result.record_status).toBe('draft')
  })
})
