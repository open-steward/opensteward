import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type PennylaneJournalEntry,
  type PennylaneLedgerEvent,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/journal'

function makeLedgerEvent(overrides: Partial<PennylaneLedgerEvent> = {}): PennylaneLedgerEvent {
  return {
    id: 'le-1',
    direction: 'debit',
    amount: 400,
    account_number: '411000',
    label: 'Debit entry',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<PennylaneJournalEntry> = {}): PennylaneJournalEntry {
  return {
    id: 'je-1',
    date: '2024-07-15',
    label: 'Monthly close',
    currency: 'EUR',
    ledger_events: [makeLedgerEvent()],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeJournal()).id).toBe('je-1')
  })

  it('maps label to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly close')
  })

  it('maps currency correctly', () => {
    expect(transformJournal(makeJournal()).currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-07-15'))
  })

  it('maps ledger_events to lineItems', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps debit ledger_event to debitAmount', () => {
    const result = transformJournal(makeJournal())
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].debitAmount).toBe(400)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
  })

  it('maps credit ledger_event to creditAmount', () => {
    const event = makeLedgerEvent({ direction: 'credit', amount: 400 })
    const result = transformJournal(makeJournal({ ledger_events: [event] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].creditAmount).toBe(400)
    expect(result.lineItems[0].debitAmount).toBeUndefined()
  })

  it('maps lineitem id correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].id).toBe('le-1')
  })

  it('maps lineitem accountId from account_number', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].accountId).toBe('411000')
  })

  it('maps lineitem description from label', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].description).toBe('Debit entry')
  })

  it('produces empty lineItems when ledger_events is absent', () => {
    expect(transformJournal(makeJournal({ ledger_events: [] })).lineItems).toEqual([])
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
