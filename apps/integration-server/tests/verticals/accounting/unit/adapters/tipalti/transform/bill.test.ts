import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type TipaltiInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<TipaltiInvoice> = {}): TipaltiInvoice {
  return {
    id: 'inv-tipalti-001',
    status: 'APPROVED',
    invoiceNumber: 'TIP-INV-001',
    payeeId: 'payee-42',
    currency: 'USD',
    totalAmount: 5000.0,
    paidAmount: 0,
    balanceAmount: 5000.0,
    description: 'Professional services',
    invoiceDate: '2024-03-01T00:00:00.000Z',
    dueDate: '2024-04-01T00:00:00.000Z',
    createdAt: '2024-02-28T10:00:00.000Z',
    updatedAt: '2024-03-01T08:00:00.000Z',
    lines: [
      {
        lineNumber: 1,
        description: 'Consulting hours',
        quantity: 10,
        unitPrice: 500.0,
        totalAmount: 5000.0,
        glAccountId: 'gl-exp-001',
      },
    ],
    ...overrides,
  }
}

describe('tipalti transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeRaw()).id).toBe('inv-tipalti-001')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('TIP-INV-001')
  })

  it('maps payeeId to contactId', () => {
    expect(transformBill(makeRaw()).contactId).toBe('payee-42')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PENDING status to SUBMITTED', () => {
    expect(transformBill(makeRaw({ status: 'PENDING' })).status).toBe('SUBMITTED')
  })

  it('maps PAID status', () => {
    expect(transformBill(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps DECLINED status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'DECLINED' })).status).toBe('VOIDED')
  })

  it('maps CANCELLED status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps DUPLICATE status to DELETED', () => {
    expect(transformBill(makeRaw({ status: 'DUPLICATE' })).status).toBe('DELETED')
  })

  it('derives PAID status from amounts when status absent', () => {
    const result = transformBill(makeRaw({ status: undefined, totalAmount: 100, paidAmount: 100 }))
    expect(result.status).toBe('PAID')
  })

  it('derives PARTIALLY_PAID from amounts', () => {
    const result = transformBill(makeRaw({ status: undefined, totalAmount: 100, paidAmount: 50 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('USD')
  })

  it('maps totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(5000.0)
  })

  it('maps paidAmount', () => {
    expect(transformBill(makeRaw({ paidAmount: 2500 })).paidAmount).toBe(2500)
  })

  it('maps balanceAmount', () => {
    expect(transformBill(makeRaw()).balanceAmount).toBe(5000.0)
  })

  it('maps description to notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Professional services')
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps lines to lineItems', () => {
    const result = transformBill(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemDescription).toBe('Consulting hours')
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].totalAmount).toBe(5000.0)
    expect(result.lineItems![0].accountId).toBe('gl-exp-001')
  })

  it('passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })
})
