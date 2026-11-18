import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type YukiTransactionInfo,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<YukiTransactionInfo> = {}): YukiTransactionInfo {
  return {
    TransactionID: 'TXN-9001',
    GLAccountCode: '1300',
    Date: '2026-02-01',
    Description: 'Payment received for INV-2026-001',
    Amount: '1210.00',
    Reference: 'INV-2026-001',
    ContactCode: 'C-001',
    ContactName: 'Acme BV',
    Currency: 'EUR',
    ...overrides,
  }
}

describe('transformTransaction (yuki)', () => {
  it('maps TransactionID to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('TXN-9001')
  })

  it('maps GLAccountCode to accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('1300')
  })

  it('maps Reference to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('INV-2026-001')
  })

  it('maps Description to memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Payment received for INV-2026-001')
  })

  it('maps Currency to currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('EUR')
  })

  it('parses Amount string to float totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(1210)
  })

  it('maps ContactCode and ContactName into contacts array', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts?.[0]).toEqual({ id: 'C-001', name: 'Acme BV' })
  })

  it('omits contacts when both ContactCode and ContactName are empty', () => {
    const result = transformTransaction(makeRaw({ ContactCode: '', ContactName: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps Date to createdAt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('includes a single lineitem with accountId and totalAmount', () => {
    const li = transformTransaction(makeRaw()).lineItems?.[0]
    expect(li?.accountId).toBe('1300')
    expect(li?.totalAmount).toBe(1210)
  })

  it('produces a schema-valid Transaction', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
