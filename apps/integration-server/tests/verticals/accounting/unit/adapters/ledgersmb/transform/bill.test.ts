import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/bill'
import type { LedgerSMBInvoice } from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBillRaw(overrides: Partial<LedgerSMBInvoice> = {}): LedgerSMBInvoice {
  return {
    id: 'bill-42',
    type: 'vendor',
    currency: 'USD',
    'invoice-number': 'B-2024-042',
    eca: { id: 88, type: 'vendor' },
    total: 150.0,
    taxes_total: 15.0,
    notes: 'Vendor bill note',
    dates: {
      book: '2024-05-01',
      due: '2024-06-01',
      created: '2024-05-01',
    },
    workflow: { state: 'POSTED' },
    lines: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields and converts decimals to minor units', () => {
    const result = transformBill(makeBillRaw())
    expect(result.id).toBe('bill-42')
    expect(result.billNumber).toBe('B-2024-042')
    expect(result.contactId).toBe('88')
    expect(result.currency).toBe('USD')
    // total=150.0 → 15000 minor units
    expect(result.totalAmount).toBe(15000)
    expect(result.notes).toBe('Vendor bill note')
  })

  it('maps workflow POSTED to AUTHORIZED', () => {
    expect(transformBill(makeBillRaw({ workflow: { state: 'POSTED' } })).status).toBe('AUTHORIZED')
  })

  it('maps workflow INITIAL to DRAFT', () => {
    expect(transformBill(makeBillRaw({ workflow: { state: 'INITIAL' } })).status).toBe('DRAFT')
  })

  it('maps workflow VOIDED to VOIDED', () => {
    expect(transformBill(makeBillRaw({ workflow: { state: 'VOIDED' } })).status).toBe('VOIDED')
  })

  it('maps workflow SAVED to DRAFT', () => {
    expect(transformBill(makeBillRaw({ workflow: { state: 'SAVED' } })).status).toBe('DRAFT')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBillRaw())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-06-01'))
    expect(result.createdAt).toEqual(new Date('2024-05-01'))
  })

  it('computes taxAmount from taxes_total when taxes map is absent', () => {
    const result = transformBill(makeBillRaw())
    // taxes_total=15.0 → 1500 minor units
    expect(result.taxAmount).toBe(1500)
  })

  it('maps lines to lineItems with minor-unit conversion', () => {
    const result = transformBill(
      makeBillRaw({
        lines: [
          {
            id: 'line-1',
            description: 'Service fee',
            qty: 3,
            price: 50.0,
            total: 150.0,
            part: { number: 'SVC-001', description: 'Service' },
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('SVC-001')
    expect(li.itemDescription).toBe('Service fee')
    expect(li.unitQuantity).toBe(3)
    expect(li.unitAmount).toBe(5000)
    expect(li.totalAmount).toBe(15000)
  })

  it('passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBillRaw()))).not.toThrow()
  })
})
