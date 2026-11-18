import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MoneybirdInvoice, type MoneybirdDetail } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/invoice'

function makeInvoice(overrides: Partial<MoneybirdInvoice> = {}): MoneybirdInvoice {
  return {
    id: 'mb-inv-001',
    invoice_id: '2024-0055',
    contact_id: 'contact-xyz',
    invoice_date: '2024-06-01',
    due_date: '2024-07-01',
    currency: 'EUR',
    total_price_incl_tax: '6050.00',
    total_price_excl_tax: '5000.00',
    total_tax: '1050.00',
    paid_at: null,
    state: 'open',
    details: [],
    ...overrides,
  }
}

function makeDetail(overrides: Partial<MoneybirdDetail> = {}): MoneybirdDetail {
  return {
    id: 'detail-001',
    description: 'Monthly retainer',
    amount: '1',
    price: '5000.00',
    tax_rate_id: 'tax-rate-001',
    total_price_excl_tax: '5000.00',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('mb-inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('2024-0055')
    expect(result.contactId).toBe('contact-xyz')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(6050)
    expect(result.taxAmount).toBe(1050)
  })

  it('parses string amounts to numbers', () => {
    const result = transformInvoice(makeInvoice({ total_price_incl_tax: '1234.56', total_tax: '234.56' }))
    expect(result.totalAmount).toBe(1234.56)
    expect(result.taxAmount).toBe(234.56)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
    expect(result.dueAt).toEqual(new Date('2024-07-01'))
  })

  it('parses paid_at as a Date object when present', () => {
    const result = transformInvoice(makeInvoice({ paid_at: '2024-06-20' }))
    expect(result.paidAt).toEqual(new Date('2024-06-20'))
  })

  it('omits paidAt when paid_at is null', () => {
    const result = transformInvoice(makeInvoice({ paid_at: null }))
    expect(result.paidAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft state to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ state: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps open state to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ state: 'open' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps scheduled state to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ state: 'scheduled' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps pending_payment state to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ state: 'pending_payment' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps late state to OVERDUE', () => {
    const result = transformInvoice(makeInvoice({ state: 'late' }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps paid state to PAID', () => {
    const result = transformInvoice(makeInvoice({ state: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps uncollectible state to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ state: 'uncollectible' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps details to lineItems', () => {
    const raw = makeInvoice({ details: [makeDetail()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('detail-001')
    expect(li.itemDescription).toBe('Monthly retainer')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(5000)
  })

  it('produces empty lineItems when details is absent', () => {
    const raw = makeInvoice({ details: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits invoiceNumber when invoice_id is empty', () => {
    const result = transformInvoice(makeInvoice({ invoice_id: '' }))
    expect(result.invoiceNumber).toBeUndefined()
  })

  it('omits contactId when contact_id is empty', () => {
    const result = transformInvoice(makeInvoice({ contact_id: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('omits postedAt when invoice_date is empty', () => {
    const result = transformInvoice(makeInvoice({ invoice_date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('omits dueAt when due_date is empty', () => {
    const result = transformInvoice(makeInvoice({ due_date: '' }))
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
