import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type EpsilonNetInvoice } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/invoice'

function makeInvoice(overrides: Partial<EpsilonNetInvoice> = {}): EpsilonNetInvoice {
  return {
    id: '1001',
    invoiceNumber: 'INV-2024-001',
    invoiceType: 'SalesInvoice',
    status: 'Draft',
    issueDate: '2024-03-01',
    dueDate: '2024-03-31',
    totalNetValue: 1000,
    totalVatAmount: 240,
    totalGrossValue: 1240,
    currency: 'EUR',
    counterpart: { vatNumber: 'EL123456789' },
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('EL123456789')
    expect(result.totalAmount).toBe(1240)
    expect(result.taxAmount).toBe(240)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ invoiceNumber: 'INV-SPECIAL' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Submitted status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Submitted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 10,
          description: 'Service',
          quantity: 2,
          unitPrice: 500,
          totalNetValue: 1000,
          vatAmount: 240,
          accountCode: '7000',
          discount: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Service')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(240)
    expect(li.accountId).toBe('7000')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const raw = makeInvoice({ lines: [] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
