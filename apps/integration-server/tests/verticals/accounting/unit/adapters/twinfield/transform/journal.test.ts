import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type TwinfieldJournal,
  type TwinfieldJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/journal'

function makeJournalLine(overrides: Partial<TwinfieldJournalLine> = {}): TwinfieldJournalLine {
  return {
    id: 'jl-1',
    dim1: '8000',
    dim2: 'DEB-001',
    description: 'Revenue Q2',
    debitCredit: 'debit',
    value: 5000,
    vatValue: 1050,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<TwinfieldJournal> = {}): TwinfieldJournal {
  return {
    code: 'JRN-001',
    number: '202400001',
    date: '2024-06-30',
    description: 'Monthly closing',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps code to id', () => {
    expect(transformJournal(makeJournal()).id).toBe('JRN-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly closing')
  })

  it('maps number to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('202400001')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('EUR')
  })

  it('maps date to postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-06-30'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformJournal(makeJournal({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps debit line correctly', () => {
    const raw = makeJournal({ lines: [makeJournalLine({ debitCredit: 'debit', value: 5000 })] })
    const result = transformJournal(raw)
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
  })

  it('maps credit line correctly', () => {
    const raw = makeJournal({
      lines: [makeJournalLine({ debitCredit: 'credit', value: 5000 })],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].creditAmount).toBe(5000)
    expect(result.lineItems![0].debitAmount).toBeUndefined()
  })

  it('maps line dim1 to accountId', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    expect(transformJournal(raw).lineItems![0].accountId).toBe('8000')
  })

  it('maps line dim2 to contactId', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    expect(transformJournal(raw).lineItems![0].contactId).toBe('DEB-001')
  })

  it('maps line description', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    expect(transformJournal(raw).lineItems![0].description).toBe('Revenue Q2')
  })

  it('maps line vatValue to taxAmount', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    expect(transformJournal(raw).lineItems![0].taxAmount).toBe(1050)
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
