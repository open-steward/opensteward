import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type TeamSystemInvoice } from '../../../../../../../src/verticals/accounting/adapters/teamsystem/transform/invoice'

function makeInvoice(overrides: Partial<TeamSystemInvoice> = {}): TeamSystemInvoice {
  return {
    id: 'INV-001',
    documentNumber: 'INV-001', documentDate: '2024-01-15', dueDate: '2024-02-15', netAmount: 8000, taxAmount: 2000, totalAmount: 10000, openAmount: 10000, status: 'Draft', currency: 'EUR', customerId: 'CUST-001', lines: [],
    ...overrides,
  }
}

describe('transformInvoice (teamsystem)', () => {
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
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'Draft')
    if (statusKey) {
      anyRaw[statusKey] = 'Issued'
      expect(transformInvoice(raw).status).toBe('AUTHORIZED')
    }
  })

  it('maps paid status correctly', () => {
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'Draft')
    if (statusKey) {
      anyRaw[statusKey] = 'Paid'
      expect(transformInvoice(raw).status).toBe('PAID')
    }
  })

  it('maps voided status correctly', () => {
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'Draft')
    if (statusKey) {
      anyRaw[statusKey] = 'Cancelled'
      expect(transformInvoice(raw).status).toBe('VOIDED')
    }
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
