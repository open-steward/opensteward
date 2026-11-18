import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type SnelStartTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/transaction'

function makeTransaction(overrides: Partial<SnelStartTransaction> = {}): SnelStartTransaction {
  return {
    id: 'txn-001',
    datum: '2024-03-15',
    bedrag: 2500,
    omschrijving: 'Betaling factuur F-2024-001',
    grootboekrekening: { id: 'acc-1100' },
    valutacode: 'EUR',
    boekstukType: 'bankafschrift',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps grootboekrekening.id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-1100')
  })

  it('maps boekstukType to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('bankafschrift')
  })

  it('maps omschrijving to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Betaling factuur F-2024-001')
  })

  it('maps valutacode to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps bedrag to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(2500)
  })

  it('maps datum to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when datum is empty', () => {
    expect(transformTransaction(makeTransaction({ datum: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined accountId when grootboekrekening is null', () => {
    expect(transformTransaction(makeTransaction({ grootboekrekening: null })).accountId).toBeUndefined()
  })

  it('returns undefined memo when omschrijving is empty', () => {
    expect(transformTransaction(makeTransaction({ omschrijving: '' })).memo).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
