import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type NetvisorJournalEntry,
  type NetvisorJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/journal'

function makeLine(overrides: Partial<NetvisorJournalLine> = {}): NetvisorJournalLine {
  return {
    NetvisorKey: 601,
    AccountNumber: '3000',
    Description: 'Myynti',
    DebitAmount: 5000,
    CreditAmount: 0,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<NetvisorJournalEntry> = {}): NetvisorJournalEntry {
  return {
    NetvisorKey: 55001,
    Description: 'Kuukauden myynti',
    VoucherNumber: 42,
    Date: '2024-01-31',
    Lines: [
      makeLine(),
      makeLine({
        NetvisorKey: 602,
        AccountNumber: '1930',
        DebitAmount: 0,
        CreditAmount: 5000,
        Description: 'Pankkimaksu',
      }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('55001')
  })

  it('maps Description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Kuukauden myynti')
  })

  it('maps VoucherNumber to reference as string', () => {
    expect(transformJournal(makeJournal()).reference).toBe('42')
  })

  it('maps Date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when Date is empty', () => {
    expect(transformJournal(makeJournal({ Date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined description when Description is empty', () => {
    expect(transformJournal(makeJournal({ Description: '' })).description).toBeUndefined()
  })

  it('maps Lines to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('601')
    expect(debitLine.accountId).toBe('3000')
    expect(debitLine.description).toBe('Myynti')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('602')
    expect(creditLine.accountId).toBe('1930')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('handles empty Lines array', () => {
    const j = transformJournal(makeJournal({ Lines: [] }))
    expect(j.lineItems).toHaveLength(0)
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
