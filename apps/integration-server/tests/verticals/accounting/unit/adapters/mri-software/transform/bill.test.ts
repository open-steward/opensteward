import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type MriBill,
  type MriBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/mri-software/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

const sampleLine: MriBillLine = {
  id: 'line-001',
  description: 'Office supplies',
  accountId: 'acct-002',
  unitAmount: 5000,
  quantity: 2,
  taxAmount: 1000,
  totalAmount: 11000,
}

function makeRaw(overrides: Partial<MriBill> = {}): MriBill {
  return {
    id: 'bill-001',
    billNumber: 'BILL-2024-001',
    vendorId: 'vend-001',
    currencyCode: 'USD',
    status: 'OPEN',
    totalAmount: 11000,
    taxAmount: 1000,
    invoiceDate: '2024-03-01T00:00:00.000Z',
    dueDate: '2024-03-31T00:00:00.000Z',
    notes: 'Net 30',
    lines: [sampleLine],
    createdAt: '2024-03-01T08:00:00.000Z',
    updatedAt: '2024-03-15T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill (mri-software)', () => {
  it('maps id', () => {
    expect(transformBill(makeRaw()).id).toBe('bill-001')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('BILL-2024-001')
  })

  it('maps vendorId to contactId', () => {
    expect(transformBill(makeRaw()).contactId).toBe('vend-001')
  })

  it('maps currencyCode to currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('USD')
  })

  it('maps OPEN status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'OPEN' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformBill(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps VOID status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'VOID' })).status).toBe('VOIDED')
  })

  it('maps totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(11000)
  })

  it('maps taxAmount', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(1000)
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('maps dueDate to dueAt', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-03-31T00:00:00.000Z'))
  })

  it('maps lineitem description', () => {
    expect(transformBill(makeRaw()).lineItems![0].itemDescription).toBe('Office supplies')
  })

  it('maps lineitem totalAmount', () => {
    expect(transformBill(makeRaw()).lineItems![0].totalAmount).toBe(11000)
  })

  it('passes BillSchema.parse without throwing', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})
