import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type LedgerSMBInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<LedgerSMBInvoice> = {}): LedgerSMBInvoice {
  return {
    id: 'inv-100',
    type: 'customer',
    currency: 'USD',
    'invoice-number': 'INV-2024-100',
    'po-number': 'PO-REF-001',
    eca: { id: 55, type: 'customer' },
    total: 200.0,
    taxes_total: 20.0,
    notes: 'Consulting invoice',
    dates: {
      book: '2024-07-01',
      due: '2024-08-01',
      created: '2024-07-01',
    },
    workflow: { state: 'POSTED' },
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields with decimal→minor conversion', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-100')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-2024-100')
    expect(result.contactId).toBe('55')
    expect(result.currency).toBe('USD')
    // 200.0 → 20000
    expect(result.totalAmount).toBe(20000)
    expect(result.reference).toBe('PO-REF-001')
  })

  it('maps type vendor to BILL', () => {
    expect(transformInvoice(makeInvoice({ type: 'vendor' })).type).toBe('BILL')
  })

  it('maps workflow POSTED to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ workflow: { state: 'POSTED' } })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps workflow INITIAL to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ workflow: { state: 'INITIAL' } })).status).toBe('DRAFT')
  })

  it('maps workflow VOIDED to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ workflow: { state: 'VOIDED' } })).status).toBe('VOIDED')
  })

  it('maps workflow DELETED to DELETED', () => {
    expect(transformInvoice(makeInvoice({ workflow: { state: 'DELETED' } })).status).toBe('DELETED')
  })

  it('parses book date as postedAt and due date as dueAt', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
    expect(result.dueAt).toEqual(new Date('2024-08-01'))
  })

  it('maps lines to lineItems with minor-unit prices', () => {
    const result = transformInvoice(
      makeInvoice({
        lines: [
          {
            id: 'line-2',
            description: 'Hour of work',
            qty: 8,
            price: 100.0,
            total: 800.0,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitQuantity).toBe(8)
    expect(result.lineItems![0].unitAmount).toBe(10000)
    expect(result.lineItems![0].totalAmount).toBe(80000)
  })

  it('passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('round-trips through untransformInvoice', () => {
    const canonical = transformInvoice(makeInvoice())
    const wire = untransformInvoice(canonical)
    expect((wire.eca as { id?: string })?.id).toBe('55')
    expect(wire.currency).toBe('USD')
    expect(wire['invoice-number']).toBe('INV-2024-100')
  })
})
