import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type TymsSale,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeSale(overrides: Partial<TymsSale> = {}): TymsSale {
  return {
    uuid: 'sale-001',
    title: 'POS Sale',
    date: '2024-05-10',
    amount: 3000,
    tax: 600,
    currency: 'USD',
    payment_type: 'cash',
    memo: 'Walk-in customer',
    customer: { uuid: 'cust-77', name: 'John Smith' },
    source_uuid: 'src-abc',
    created_at: '2024-05-10T00:00:00.000Z',
    updated_at: '2024-05-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeSale())
    expect(result.id).toBe('sale-001')
    expect(result.type).toBe('SALE')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(3000)
    expect(result.taxAmount).toBe(600)
  })

  it('uses memo field for memo', () => {
    const result = transformTransaction(makeSale({ memo: 'Walk-in customer' }))
    expect(result.memo).toBe('Walk-in customer')
  })

  it('falls back to title for memo when memo is absent', () => {
    const result = transformTransaction(makeSale({ memo: undefined, title: 'POS Sale' }))
    expect(result.memo).toBe('POS Sale')
  })

  it('maps source_uuid to reference', () => {
    const result = transformTransaction(makeSale({ source_uuid: 'src-xyz' }))
    expect(result.reference).toBe('src-xyz')
  })

  it('maps customer to contacts array', () => {
    const result = transformTransaction(makeSale())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cust-77')
    expect(result.contacts![0].name).toBe('John Smith')
  })

  it('maps paymentMethod from payment_type', () => {
    const result = transformTransaction(makeSale({ payment_type: 'card' }))
    expect(result.paymentMethod).toBe('card')
  })

  it('maps lineItems', () => {
    const raw = makeSale({
      items: [{ uuid: 'si-1', name: 'Coffee', price: 5, quantity: 3, amount: 15, account: 'REV' }],
    })
    const result = transformTransaction(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].name).toBe('Coffee')
    expect(result.lineItems![0].totalAmount).toBe(15)
    expect(result.lineItems![0].accountId).toBe('REV')
  })

  it('passes raw as metadata', () => {
    const raw = makeSale()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformTransaction(makeSale())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
