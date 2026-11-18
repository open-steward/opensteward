import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SistemiInvoice } from '../../../../../../../src/verticals/accounting/adapters/sistemi/transform/invoice'

function makeInvoice(overrides: Partial<SistemiInvoice> = {}): SistemiInvoice {
  return {
    id: 'INV-001',
    invoice_number: 'INV-001', invoice_date: '2024-01-15', due_date: '2024-02-15', net_amount: 8000, vat_amount: 2000, gross_amount: 10000, outstanding_amount: 10000, status: 'DRAFT', currency: 'EUR', customer_id: 'CUST-001', lines: [],
    ...overrides,
  }
}

describe('transformInvoice (sistemi)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('INV-001')
    expect(result.type).toBe('INVOICE')
    expect(result.totalAmount).toBe(10000)
    expect(result.currency).toBe('EUR')
  })

  it('passes raw object as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('defaults to DRAFT for draft status', () => {
    expect(transformInvoice(makeInvoice()).status).toBe('DRAFT')
  })

  it('maps authorized status correctly', () => {
    // status field overridden below via spread
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    // find the status field key
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'DRAFT')
    if (statusKey) {
      anyRaw[statusKey] = 'ISSUED'
      expect(transformInvoice(raw).status).toBe('AUTHORIZED')
    }
  })

  it('maps paid status correctly', () => {
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'DRAFT')
    if (statusKey) {
      anyRaw[statusKey] = 'PAID'
      expect(transformInvoice(raw).status).toBe('PAID')
    }
  })

  it('maps voided status correctly', () => {
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'DRAFT')
    if (statusKey) {
      anyRaw[statusKey] = 'CANCELLED'
      expect(transformInvoice(raw).status).toBe('VOIDED')
    }
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
