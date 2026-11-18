import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MazeedOneInvoice } from '../../../../../../../src/verticals/accounting/adapters/mazeedone/transform/invoice'

function makeRaw(overrides: Partial<MazeedOneInvoice> = {}): MazeedOneInvoice {
  return {
    id: 'INV-001',
    invoice_no: 'MZ-2024-001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    subtotal: 2000,
    vat_amount: 300,
    total: 2300,
    outstanding: 2300,
    state: 'issued',
    client_id: 'CLIENT-001',
    currency: 'SAR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (mazeedone)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-001')
    expect(result.totalAmount).toBe(2300)
    expect(result.taxAmount).toBe(300)
    expect(result.currency).toBe('SAR')
    expect(result.type).toBe('INVOICE')
  })

  it('maps invoiceNumber from invoice_no', () => {
    const result = transformInvoice(makeRaw())
    expect(result.invoiceNumber).toBe('MZ-2024-001')
  })

  it('maps contactId from client_id', () => {
    const result = transformInvoice(makeRaw())
    expect(result.contactId).toBe('CLIENT-001')
  })

  it('maps balanceAmount from outstanding', () => {
    const result = transformInvoice(makeRaw({ outstanding: 1000 }))
    expect(result.balanceAmount).toBe(1000)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft state to DRAFT', () => {
    expect(transformInvoice(makeRaw({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps issued state to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ state: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps paid state to PAID', () => {
    expect(transformInvoice(makeRaw({ state: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled state to VOIDED', () => {
    expect(transformInvoice(makeRaw({ state: 'cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown state to DRAFT', () => {
    expect(transformInvoice(makeRaw({ state: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lines: [
        {
          id: 'LINE-1',
          description: 'ERP Module License',
          qty: 1,
          unit_price: 2000,
          total: 2000,
          vat_amount: 300,
          account_id: 'ACC-400',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('LINE-1')
    expect(result.lineItems![0].unitQuantity).toBe(1)
    expect(result.lineItems![0].totalAmount).toBe(2000)
    expect(result.lineItems![0].taxAmount).toBe(300)
    expect(result.lineItems![0].accountId).toBe('ACC-400')
  })

  it('returns empty lineItems when lines is empty', () => {
    const result = transformInvoice(makeRaw({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('handles missing date fields', () => {
    const result = transformInvoice(makeRaw({ invoice_date: '', due_date: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('handles numeric id correctly', () => {
    const result = transformInvoice(makeRaw({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
