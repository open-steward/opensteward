import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ContaAzulTransaction } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/transaction'

function makeTransaction(overrides: Partial<ContaAzulTransaction> = {}): ContaAzulTransaction {
  return {
    id: 'txn-001',
    account_id: 'acc-10',
    type: 'payment',
    reference: 'PAG-2025-001',
    currency: 'BRL',
    total: 7500,
    date: '2025-05-25',
    contact_id: 'con-300',
    contact_name: 'Maria Silva',
    entries: [
      { account_id: 'acc-10', description: 'Pagamento recebido', amount: 7500, type: 'credit' },
    ],
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('txn-001')
    expect(result.accountId).toBe('acc-10')
    expect(result.type).toBe('payment')
    expect(result.reference).toBe('PAG-2025-001')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(7500)
  })

  it('maps contacts', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('con-300')
    expect(result.contacts![0].name).toBe('Maria Silva')
  })

  it('returns undefined contacts when no contact_id', () => {
    const result = transformTransaction(makeTransaction({ contact_id: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps line items from entries', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('acc-10')
    expect(result.lineItems?.[0].totalAmount).toBe(7500)
  })

  it('maps date to createdAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2025-05-25'))
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
