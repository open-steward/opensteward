import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawTrendyolSettlement,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeSettlement(
  overrides: Partial<RawTrendyolSettlement> = {},
): RawTrendyolSettlement {
  return {
    id: 999001,
    transactionDate: 1704067200000, // 2024-01-01T00:00:00.000Z
    transactionType: 'Sale',
    sellerRevenue: 254.99,
    orderNumber: 'TY-2024-001',
    affiliate: 'Trendyol',
    receiptId: 77777,
    credit: 0,
    debt: 0,
    ...overrides,
  }
}

describe('transformTransaction (Trendyol)', () => {
  it('maps id as string', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.id).toBe('999001')
  })

  it('maps orderId from orderNumber', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.orderId).toBe('TY-2024-001')
  })

  it('maps Sale transactionType → SALE kind', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.kind).toBe('SALE')
  })

  it('maps Return transactionType → REFUND kind', () => {
    const result = transformTransaction(makeSettlement({ transactionType: 'Return' }))
    expect(result.kind).toBe('REFUND')
  })

  it('always maps status to SUCCESS (settlements are finalized)', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.status).toBe('SUCCESS')
  })

  it('converts sellerRevenue (major TRY) to minor units', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.amount?.amount).toBe(25499)
    expect(result.amount?.currency).toBe('TRY')
  })

  it('uses credit-debt when sellerRevenue is 0', () => {
    const result = transformTransaction(
      makeSettlement({ sellerRevenue: 0, credit: 100, debt: 30 }),
    )
    expect(result.amount?.amount).toBe(7000) // (100-30)*100
  })

  it('maps gateway from affiliate', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.gateway).toBe('Trendyol')
  })

  it('maps authorizationCode from receiptId', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.authorizationCode).toBe('77777')
  })

  it('converts epoch ms transactionDate to processedAt ISO string', () => {
    const result = transformTransaction(makeSettlement())
    expect(result.processedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSettlement()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeSettlement())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
