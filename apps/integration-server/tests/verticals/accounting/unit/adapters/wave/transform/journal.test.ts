import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type WaveJournal,
  type WaveJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/journal'

function makeJournalLine(overrides: Partial<WaveJournalLine> = {}): WaveJournalLine {
  return {
    id: 'line-1',
    accountId: 'acc-1',
    description: 'Office supplies',
    debit: 100,
    credit: 0,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<WaveJournal> = {}): WaveJournal {
  return {
    id: 'jnl-001',
    entryDate: '2024-03-15',
    description: 'Monthly adjustment',
    reference: 'REF-001',
    currency: { code: 'CAD' },
    lines: [],
    createdAt: '2024-03-15T10:00:00Z',
    modifiedAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id', () => {
    expect(transformJournal(makeJournal()).id).toBe('jnl-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly adjustment')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('REF-001')
  })

  it('maps currency.code to currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('CAD')
  })

  it('maps entryDate to postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps lines to lineItems', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.accountId).toBe('acc-1')
    expect(li.description).toBe('Office supplies')
    expect(li.debitAmount).toBe(100)
    expect(li.creditAmount).toBeUndefined()
  })

  it('returns undefined description when description is empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when reference is empty', () => {
    expect(transformJournal(makeJournal({ reference: '' })).reference).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
