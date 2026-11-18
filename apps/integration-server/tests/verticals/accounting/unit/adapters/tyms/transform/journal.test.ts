import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type TymsJournal,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(overrides: Partial<TymsJournal> = {}): TymsJournal {
  return {
    uuid: 'jnl-001',
    journal_no: 'JNL-2024-001',
    description: 'Monthly accrual',
    date: '2024-06-30',
    currency: 'USD',
    exchange_rate: 1,
    created_at: '2024-06-30T00:00:00.000Z',
    updated_at: '2024-06-30T00:00:00.000Z',
    items: [
      {
        uuid: 'ji-1',
        account: 'ACC-1000',
        description: 'Debit cash',
        debit: 500,
        credit: 0,
        amount: 500,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('jnl-001')
    expect(result.reference).toBe('JNL-2024-001')
    expect(result.description).toBe('Monthly accrual')
    expect(result.currency).toBe('USD')
  })

  it('parses postedAt as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-06-30'))
  })

  it('maps lineItems with string account', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('ji-1')
    expect(li.accountId).toBe('ACC-1000')
    expect(li.debitAmount).toBe(500)
  })

  it('maps lineItems with object account', () => {
    const raw = makeJournal({
      items: [{ uuid: 'ji-2', account: { uuid: 'ACC-2000' }, debit: 200 }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].accountId).toBe('ACC-2000')
  })

  it('maps contact.uuid to contactId on lineitem', () => {
    const raw = makeJournal({
      items: [{ account: 'ACC-X', contact: { uuid: 'con-99' }, debit: 100 }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].contactId).toBe('con-99')
  })

  it('passes raw as metadata', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformJournal', () => {
    const canonical = transformJournal(
      makeJournal({ description: 'Round-trip test', currency: 'GBP' }),
    )
    const body = untransformJournal(canonical)
    expect(body['description']).toBe('Round-trip test')
    expect(body['currency']).toBe('GBP')
    expect(body['exchange_rate']).toBe(1)
  })
})
