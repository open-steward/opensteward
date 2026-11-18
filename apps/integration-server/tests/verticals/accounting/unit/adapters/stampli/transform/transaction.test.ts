import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type StampliPayment,
} from '../../../../../../../src/verticals/accounting/adapters/stampli/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<StampliPayment> = {}): StampliPayment {
  return {
    id: 'pay-001',
    invoiceId: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    vendorId: 'vendor-42',
    vendorName: 'Acme Supplies',
    paymentMethod: 'ACH',
    amount: 1250.0,
    currency: 'USD',
    status: 'COMPLETED',
    paymentDate: '2024-02-15',
    referenceNumber: 'REF-001',
    memo: 'Payment for INV-2024-001',
    createdAt: '2024-02-15T09:30:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('stampli transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('pay-001')
  })

  it('always sets type to PAYMENT', () => {
    expect(transformTransaction(makeRaw()).type).toBe('PAYMENT')
  })

  it('maps invoiceNumber to reference (preferred over invoiceId)', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('INV-2024-001')
  })

  it('falls back to invoiceId for reference when invoiceNumber absent', () => {
    expect(transformTransaction(makeRaw({ invoiceNumber: undefined })).reference).toBe('inv-001')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Payment for INV-2024-001')
  })

  it('maps paymentMethod', () => {
    expect(transformTransaction(makeRaw()).paymentMethod).toBe('ACH')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('USD')
  })

  it('converts amount to minor units (× 100)', () => {
    // 1250.00 → 125000
    expect(transformTransaction(makeRaw({ amount: 1250.0 })).totalAmount).toBe(125000)
  })

  it('creates contacts entry for vendorId', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('vendor-42')
    expect(result.contacts![0].name).toBe('Acme Supplies')
  })

  it('omits contacts when vendorId absent', () => {
    expect(transformTransaction(makeRaw({ vendorId: undefined })).contacts).toBeUndefined()
  })

  it('maps lineItems from amount', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(125000)
  })

  it('maps createdAt to Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-02-15T09:30:00.000Z'))
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('handles missing amount gracefully (no lineItems)', () => {
    const result = transformTransaction(makeRaw({ amount: undefined }))
    expect(result.lineItems).toHaveLength(0)
    expect(result.totalAmount).toBeUndefined()
  })
})
