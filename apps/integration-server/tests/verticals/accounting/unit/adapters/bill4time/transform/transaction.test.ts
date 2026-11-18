import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type Bill4TimePayment,
} from '../../../../../../../src/verticals/accounting/adapters/bill4time/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<Bill4TimePayment> = {}): Bill4TimePayment {
  return {
    PaymentId: 'PMT-001',
    ClientID: 'CLIENT-001',
    ClientName: 'Acme Corp',
    InvoiceId: 'INV-777',
    InvoiceNumber: 'B4T-2024-001',
    PaymentDate: '2024-02-01',
    Amount: 600,
    Currency: 'USD',
    PaymentMethod: 'Credit Card',
    Notes: 'Payment received',
    Reference: 'REF-001',
    DepositedTo: 'BA-001',
    ...overrides,
  }
}

describe('transformTransaction (bill4time)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('PMT-001')
    expect(result.accountId).toBe('BA-001')
    expect(result.type).toBe('PAYMENT')
    // InvoiceNumber takes precedence for reference
    expect(result.reference).toBe('B4T-2024-001')
    expect(result.memo).toBe('Payment received')
    expect(result.paymentMethod).toBe('Credit Card')
    expect(result.currency).toBe('USD')
    // Bill4Time passes amounts directly without minor-unit conversion
    expect(result.totalAmount).toBe(600)
  })

  it('maps client as contact', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toBeDefined()
    expect(result.contacts![0].id).toBe('CLIENT-001')
    expect(result.contacts![0].name).toBe('Acme Corp')
  })

  it('parses PaymentDate as createdAt Date', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-02-01'))
  })

  it('falls back reference to InvoiceId when InvoiceNumber is missing', () => {
    const result = transformTransaction(makeRaw({ InvoiceNumber: undefined }))
    expect(result.reference).toBe('INV-777')
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
