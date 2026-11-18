import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type CmicInvoice } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/invoice'

function makeInvoice(overrides: Partial<CmicInvoice> = {}): CmicInvoice {
  return {
    InvoiceId: 'INV-001',
    InvoiceNumber: 'PI-2024-001',
    Status: 'Draft',
    SubcontractorId: 'SUB-456',
    ProjectCode: 'PRJ-001',
    Currency: 'USD',
    Amount: 15000,
    TaxAmount: 1500,
    InvoiceDate: '2024-03-01',
    DueDate: '2024-03-31',
    Lines: [],
    ...overrides,
  }
}

describe('transformInvoice (CMiC)', () => {
  it('maps id from InvoiceId', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('INV-001')
  })

  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.invoiceNumber).toBe('PI-2024-001')
    expect(result.contactId).toBe('SUB-456')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(15000)
    expect(result.taxAmount).toBe(1500)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Void' })).status).toBe('VOIDED')
  })

  it('maps line items', () => {
    const raw = makeInvoice({
      Lines: [
        {
          LineId: 'LN-1',
          Description: 'Concrete work',
          Quantity: 100,
          UnitPrice: 50,
          LineAmount: 5000,
          TaxAmount: 500,
          AccountCode: '5100',
          CostCode: 'CC-CONCRETE',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('LN-1')
    expect(li.itemDescription).toBe('Concrete work')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(100)
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(500)
    expect(li.accountId).toBe('5100')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
