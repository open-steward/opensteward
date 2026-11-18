import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ReckonJournal } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/journal'

function makeRaw(overrides: Partial<ReckonJournal> = {}): ReckonJournal {
  return {
    id: 'jnl-001',
    reference: 'JNL-REF-001',
    date: '2024-03-10',
    description: 'Depreciation entry',
    lineItems: [],
    ...overrides,
  }
}

describe('transformJournal (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('jnl-001')
    expect(result.reference).toBe('JNL-REF-001')
    expect(result.description).toBe('Depreciation entry')
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps debit line item', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          accountId: 'acc-200',
          accountName: 'Depreciation',
          description: 'Equipment depreciation',
          debitAmount: 1000,
          creditAmount: 0,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.accountId).toBe('acc-200')
    expect(li.description).toBe('Equipment depreciation')
    expect(li.debitAmount).toBe(1000)
  })

  it('maps credit line item', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-2',
          accountId: 'acc-300',
          accountName: 'Accumulated Depreciation',
          description: '',
          debitAmount: 0,
          creditAmount: 1000,
        },
      ],
    })
    const result = transformJournal(raw)
    const li = result.lineItems![0]
    expect(li.creditAmount).toBe(1000)
  })

  it('omits zero debitAmount', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          accountId: 'acc-100',
          accountName: 'Test',
          description: '',
          debitAmount: 0,
          creditAmount: 500,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].debitAmount).toBeUndefined()
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
