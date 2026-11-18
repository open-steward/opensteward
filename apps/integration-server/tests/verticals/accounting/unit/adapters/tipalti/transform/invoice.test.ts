import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type TipaltiInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<TipaltiInvoice> = {}): TipaltiInvoice {
  return {
    id: 'inv-tipalti-002',
    status: 'PAID',
    invoiceNumber: 'TIP-INV-002',
    payeeId: 'payee-99',
    currency: 'USD',
    totalAmount: 8000.0,
    paidAmount: 8000.0,
    balanceAmount: 0,
    description: 'Software license',
    invoiceDate: '2024-04-01T00:00:00.000Z',
    dueDate: '2024-05-01T00:00:00.000Z',
    paidDate: '2024-04-15T00:00:00.000Z',
    createdAt: '2024-03-30T09:00:00.000Z',
    updatedAt: '2024-04-15T10:00:00.000Z',
    lines: [
      {
        lineNumber: 1,
        description: 'Enterprise license',
        quantity: 1,
        unitPrice: 8000.0,
        totalAmount: 8000.0,
      },
    ],
    ...overrides,
  }
}

describe('tipalti transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('inv-tipalti-002')
  })

  it('always sets type to BILL (Tipalti invoices are AP)', () => {
    expect(transformInvoice(makeRaw()).type).toBe('BILL')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps PENDING_APPROVAL to SUBMITTED', () => {
    expect(transformInvoice(makeRaw({ status: 'PENDING_APPROVAL' })).status).toBe('SUBMITTED')
  })

  it('maps PROCESSING to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'PROCESSING' })).status).toBe('AUTHORIZED')
  })

  it('maps invoiceNumber to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('TIP-INV-002')
  })

  it('maps payeeId to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('payee-99')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeRaw()).currency).toBe('USD')
  })

  it('maps totalAmount', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(8000.0)
  })

  it('maps paidAmount', () => {
    expect(transformInvoice(makeRaw()).paidAmount).toBe(8000.0)
  })

  it('maps balanceAmount', () => {
    expect(transformInvoice(makeRaw()).balanceAmount).toBe(0)
  })

  it('maps description to notes', () => {
    expect(transformInvoice(makeRaw()).notes).toBe('Software license')
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps paidDate to paidAt as Date', () => {
    expect(transformInvoice(makeRaw()).paidAt).toEqual(new Date('2024-04-15T00:00:00.000Z'))
  })

  it('maps lines to lineItems', () => {
    const result = transformInvoice(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemDescription).toBe('Enterprise license')
  })

  it('passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })
})
