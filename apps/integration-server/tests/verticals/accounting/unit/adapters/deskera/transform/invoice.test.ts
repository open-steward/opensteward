import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type DeskeraInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/invoice'

function makeRaw(overrides: Partial<DeskeraInvoice> = {}): DeskeraInvoice {
  return {
    id: 'INV-001',
    documentSequenceCode: 'SI-0001',
    documentDate: '2024-01-15',
    validTillDate: '2024-02-15',
    totalAmount: 11800,
    taxAmount: 1800,
    dueAmount: 11800,
    subTotal: 10000,
    currency: 'SGD',
    contactCode: 'CUST-001',
    contactName: 'Acme Pte Ltd',
    type: 'SALES_INVOICE',
    status: 'OPEN',
    documentItems: [],
    memo: 'Test invoice',
    ...overrides,
  }
}

describe('transformInvoice (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-001')
    expect(result.invoiceNumber).toBe('SI-0001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(11800)
    expect(result.taxAmount).toBe(1800)
    expect(result.balanceAmount).toBe(11800)
    expect(result.currency).toBe('SGD')
    expect(result.type).toBe('INVOICE')
    expect(result.notes).toBe('Test invoice')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ memo: 'special memo' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps DRAFT status correctly', () => {
    const result = transformInvoice(makeRaw({ status: 'DRAFT' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps OPEN status to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ status: 'OPEN' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps PARTIAL status to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ status: 'PARTIAL' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps PAID status correctly', () => {
    const result = transformInvoice(makeRaw({ status: 'PAID' }))
    expect(result.status).toBe('PAID')
  })

  it('maps VOID status to VOIDED', () => {
    const result = transformInvoice(makeRaw({ status: 'VOID' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps document items to lineItems', () => {
    const raw = makeRaw({
      documentItems: [
        {
          id: 'item-1',
          name: 'Widget',
          description: 'A widget',
          quantity: 5,
          unitPrice: 2000,
          totalAmount: 10000,
          taxAmount: 1800,
          accountCode: 'ACC-001',
          taxCode: 'GST-9',
          discountAmount: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemDescription).toBe('A widget')
    expect(li.unitAmount).toBe(2000)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(1800)
    expect(li.accountId).toBe('ACC-001')
  })

  it('falls back to id when documentSequenceCode is absent', () => {
    const result = transformInvoice(makeRaw({ documentSequenceCode: undefined }))
    expect(result.invoiceNumber).toBe('INV-001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
