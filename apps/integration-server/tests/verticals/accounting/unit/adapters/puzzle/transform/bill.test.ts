import { describe, it, expect } from 'vitest'
import {
  transformBill,
  untransformBill,
  type PuzzleBill,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<PuzzleBill> = {}): PuzzleBill {
  return {
    id: 'bill-pzl-1',
    createdAt: '2025-01-10T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    issueDate: '2025-01-10',
    dueDate: '2025-02-10',
    vendorId: 'vendor-7',
    externalId: 'EXTBILL-99',
    description: 'Office supplies',
    amount: { amount: '1200.00', currency: 'USD' },
    status: 'Draft',
    lines: [
      {
        id: 'bline-1',
        amount: { amount: '1200.00', currency: 'USD' },
        coaKey: 'office_supplies',
        quantity: 3,
        unitPrice: '400.00',
        description: 'Paper reams',
      },
    ],
    ...overrides,
  }
}

describe('puzzle transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeRaw()).id).toBe('bill-pzl-1')
  })

  it('maps Draft status', () => {
    expect(transformBill(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Posted status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'Posted' })).status).toBe('AUTHORIZED')
  })

  it('maps Overdue currentness to OVERDUE (takes priority over status)', () => {
    expect(transformBill(makeRaw({ status: 'Posted', currentness: 'Overdue' })).status).toBe(
      'OVERDUE',
    )
  })

  it('maps Voided status', () => {
    expect(transformBill(makeRaw({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps Paid status', () => {
    expect(transformBill(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps externalId to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('EXTBILL-99')
  })

  it('maps vendorId to contactId', () => {
    expect(transformBill(makeRaw()).contactId).toBe('vendor-7')
  })

  it('maps amount.currency to currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('USD')
  })

  it('converts amount to minor units', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(120000)
  })

  it('maps description to notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Office supplies')
  })

  it('maps line description to itemDescription', () => {
    expect(transformBill(makeRaw()).lineItems?.[0]?.itemDescription).toBe('Paper reams')
  })

  it('converts line unitPrice to minor units', () => {
    expect(transformBill(makeRaw()).lineItems?.[0]?.unitAmount).toBe(40000)
  })

  it('rounds line quantity', () => {
    expect(transformBill(makeRaw()).lineItems?.[0]?.unitQuantity).toBe(3)
  })

  it('passes BillSchema.parse', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})

describe('puzzle untransformBill round-trip', () => {
  it('maps contactId back to vendorId', () => {
    const bill = transformBill(makeRaw())
    const raw = untransformBill(bill, 'comp-1')
    expect(raw['vendorId']).toBe('vendor-7')
  })

  it('maps billNumber back to externalId', () => {
    const bill = transformBill(makeRaw())
    const raw = untransformBill(bill, 'comp-1')
    expect(raw['externalId']).toBe('EXTBILL-99')
  })

  it('maps notes back to description', () => {
    const bill = transformBill(makeRaw())
    const raw = untransformBill(bill, 'comp-1')
    expect(raw['description']).toBe('Office supplies')
  })

  it('sets shouldPost=false for DRAFT status', () => {
    const bill = transformBill(makeRaw({ status: 'Draft' }))
    expect(untransformBill(bill, 'comp-1')['shouldPost']).toBe(false)
  })

  it('sets shouldPost=true for non-DRAFT status', () => {
    const bill = transformBill(makeRaw({ status: 'Posted' }))
    expect(untransformBill(bill, 'comp-1')['shouldPost']).toBe(true)
  })

  it('converts line totalAmount back to decimal string', () => {
    const bill = transformBill(makeRaw())
    const raw = untransformBill(bill, 'comp-1')
    const lines = raw['lines'] as Array<Record<string, unknown>>
    expect(lines[0]?.['amount']).toBe('1200.00')
  })
})
