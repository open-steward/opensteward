import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type AvidXchangePayment,
} from '../../../../../../../src/verticals/accounting/adapters/avidxchange/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<AvidXchangePayment> = {}): AvidXchangePayment {
  return {
    paymentId: 'PMT-001',
    invoiceId: 'INV-100',
    vendorId: 'VND-001',
    vendorName: 'Acme Supplies',
    companyId: 'CO-001',
    paymentMethod: 'ACH',
    paymentDate: '2024-02-01T00:00:00.000Z',
    amount: 1250,
    currency: 'USD',
    status: 'PAID',
    checkNumber: undefined,
    remittanceInfo: 'Payment for INV-100',
    glAccountId: 'gl-cash',
    createdDate: '2024-02-01T00:00:00.000Z',
    modifiedDate: '2024-02-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (avidxchange)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('PMT-001')
    // invoiceId takes precedence for reference
    expect(result.reference).toBe('INV-100')
    expect(result.currency).toBe('USD')
    // AvidXchange passes amount directly (major units, no minor-unit conversion)
    expect(result.totalAmount).toBe(1250)
    expect(result.paymentMethod).toBe('ACH')
    expect(result.memo).toBe('Payment for INV-100')
  })

  it('maps glAccountId to accountId', () => {
    const result = transformTransaction(makeRaw())
    expect(result.accountId).toBe('gl-cash')
  })

  it('maps vendor as contact', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toBeDefined()
    expect(result.contacts![0].id).toBe('VND-001')
    expect(result.contacts![0].name).toBe('Acme Supplies')
  })

  it('parses paymentDate as createdAt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-02-01T00:00:00.000Z'))
  })

  it('falls back to createdDate when paymentDate is missing', () => {
    const result = transformTransaction(makeRaw({ paymentDate: undefined }))
    expect(result.createdAt).toEqual(new Date('2024-02-01T00:00:00.000Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
