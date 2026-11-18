import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type MezanJournal,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(overrides: Partial<MezanJournal> = {}): MezanJournal {
  return {
    id: 'jrnl_001',
    reference: 'JE-100',
    transaction_date: '2024-03-01',
    description: 'Revenue recognition',
    status: 'confirmed',
    entries: [
      {
        id: 'e1',
        account_id: 'acct_400',
        description: 'Sales revenue',
        debit: 0,
        credit: 100000,
      },
      {
        id: 'e2',
        account_id: 'acct_100',
        description: 'Cash',
        debit: 100000,
        credit: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal (mezan)', () => {
  it('maps id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrnl_001')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-100')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Revenue recognition')
  })

  it('falls back to transaction_note when description is absent', () => {
    const result = transformJournal(
      makeJournal({ description: undefined, transaction_note: 'backup note' }),
    )
    expect(result.description).toBe('backup note')
  })

  it('maps transaction_date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps journal entries to lineItems', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
  })

  it('maps journal entry id', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems![0].id).toBe('e1')
  })

  it('maps journal entry accountId', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems![0].accountId).toBe('acct_400')
  })

  it('maps journal entry creditAmount', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems![0].creditAmount).toBe(100000)
  })

  it('maps journal entry debitAmount', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems![1].debitAmount).toBe(100000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('passes JournalSchema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })

  describe('untransformJournal', () => {
    it('round-trips transaction_date from postedAt', () => {
      const j = transformJournal(makeJournal())
      const out = untransformJournal(j)
      expect(out.transaction_date).toBe('2024-03-01')
    })

    it('round-trips description', () => {
      const j = transformJournal(makeJournal())
      const out = untransformJournal(j)
      expect(out.description).toBe('Revenue recognition')
    })

    it('round-trips entries from lineItems', () => {
      const j = transformJournal(makeJournal())
      const out = untransformJournal(j)
      expect(Array.isArray(out.entries)).toBe(true)
      expect((out.entries as unknown[]).length).toBe(2)
    })
  })
})
