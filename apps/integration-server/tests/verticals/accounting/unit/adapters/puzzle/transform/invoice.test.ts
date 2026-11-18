import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type PuzzleInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<PuzzleInvoice> = {}): PuzzleInvoice {
  return {
    id: 'inv-pzl-1',
    createdAt: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-03-10T00:00:00.000Z',
    issueDate: '2025-03-01',
    // dueDate in the future so status doesn't flip to OVERDUE
    dueDate: '2099-04-01',
    customerId: 'cust-pzl-42',
    nativeId: 'INV-2025-001',
    description: 'Consulting services',
    amount: { amount: '3000.00', currency: 'USD' },
    status: 'Draft',
    lines: [
      {
        id: 'iline-1',
        amount: { amount: '3000.00', currency: 'USD' },
        coaKey: 'operating_income',
        quantity: 10,
        unitPrice: '300.00',
        description: 'Consulting hours',
      },
    ],
    ...overrides,
  }
}

describe('puzzle transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('inv-pzl-1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps Draft status', () => {
    expect(transformInvoice(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Posted status to AUTHORIZED when dueDate in future', () => {
    expect(transformInvoice(makeRaw({ status: 'Posted' })).status).toBe('AUTHORIZED')
  })

  it('maps Posted status to OVERDUE when dueDate in past', () => {
    expect(transformInvoice(makeRaw({ status: 'Posted', dueDate: '2020-01-01' })).status).toBe(
      'OVERDUE',
    )
  })

  it('maps Voided status', () => {
    expect(transformInvoice(makeRaw({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps Paid status', () => {
    expect(transformInvoice(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps nativeId to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-2025-001')
  })

  it('maps customerId to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('cust-pzl-42')
  })

  it('converts amount to minor units', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(300000)
  })

  it('maps description to notes', () => {
    expect(transformInvoice(makeRaw()).notes).toBe('Consulting services')
  })

  it('maps line description to itemDescription', () => {
    expect(transformInvoice(makeRaw()).lineItems?.[0]?.itemDescription).toBe('Consulting hours')
  })

  it('sets paidAt from updatedAt when status is Paid', () => {
    const result = transformInvoice(makeRaw({ status: 'Paid' }))
    expect(result.paidAt).toBeInstanceOf(Date)
  })

  it('passes InvoiceSchema.parse', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })
})

describe('puzzle untransformInvoice round-trip', () => {
  it('maps contactId back to customerId', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv, 'comp-1')
    expect(raw['customerId']).toBe('cust-pzl-42')
  })

  it('maps invoiceNumber back to nativeId', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv, 'comp-1')
    expect(raw['nativeId']).toBe('INV-2025-001')
  })

  it('maps notes back to description', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv, 'comp-1')
    expect(raw['description']).toBe('Consulting services')
  })

  it('converts line totalAmount back to decimal string', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv, 'comp-1')
    const lines = raw['lines'] as Array<Record<string, unknown>>
    expect(lines[0]?.['amount']).toBe('3000.00')
  })
})
