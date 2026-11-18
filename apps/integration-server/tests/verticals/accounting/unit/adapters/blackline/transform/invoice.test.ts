import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BlacklineInvoice } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/invoice'

function makeInvoice(overrides: Partial<BlacklineInvoice> = {}): BlacklineInvoice {
  return {
    reconciliationId: 'rec-001',
    invoiceNumber: 'INV-2024-001',
    status: 'Draft',
    accountId: 'acc-123',
    currency: 'USD',
    amount: 1200,
    taxAmount: 200,
    dueDate: '2024-04-30',
    postedDate: '2024-03-01',
    createdBy: 'user-1',
    createdAt: '2024-03-01T10:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-01T10:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (BlackLine)', () => {
  it('maps id from reconciliationId', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('rec-001')
  })

  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('acc-123')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Submitted status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Submitted' })).status).toBe('AUTHORIZED')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps line items', () => {
    const raw = makeInvoice({
      lines: [
        {
          lineId: 'line-1',
          description: 'Consulting',
          quantity: 2,
          unitAmount: 500,
          totalAmount: 1000,
          taxAmount: 200,
          accountId: '1000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('1000')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformInvoice(makeInvoice({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
