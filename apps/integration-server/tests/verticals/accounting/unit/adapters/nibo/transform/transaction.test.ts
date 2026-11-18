import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type NiboTransaction } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/transaction'

function makeRaw(overrides: Partial<NiboTransaction> = {}): NiboTransaction {
  return {
    transactionId: 1,
    postDate: '2024-08-01',
    value: 500,
    currencyCode: 'BRL',
    type: 'Credit',
    accountId: 100,
    reference: 'REF-001',
    contactId: 0,
    contactName: '',
    description: 'Pagamento recebido',
    ...overrides,
  }
}

describe('nibo transformTransaction', () => {
  it('maps transactionId to id as string', () => {
    expect(transformTransaction(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })
  it('maps postDate to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-08-01'))
  })
  it('maps contactId to contacts when nonzero', () => {
    const result = transformTransaction(makeRaw({ contactId: 7, contactName: 'Teste' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('7')
  })
  it('maps type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('Credit')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
