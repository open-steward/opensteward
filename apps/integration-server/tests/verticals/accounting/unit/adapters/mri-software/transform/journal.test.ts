import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type MriJournalEntry,
  type MriJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/mri-software/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

const sampleLine: MriJournalLine = {
  id: 'jline-001',
  accountId: 'acct-001',
  description: 'Salary expense',
  debitAmount: 50000,
  creditAmount: undefined,
  totalAmount: 50000,
}

function makeRaw(overrides: Partial<MriJournalEntry> = {}): MriJournalEntry {
  return {
    id: 'je-001',
    description: 'Monthly payroll',
    reference: 'PAY-2024-03',
    source: 'PAYROLL',
    currencyCode: 'USD',
    taxAmount: 0,
    postedDate: '2024-03-31',
    lines: [sampleLine],
    createdAt: '2024-03-31T08:00:00.000Z',
    updatedAt: '2024-03-31T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformJournal (mri-software)', () => {
  it('maps id', () => {
    expect(transformJournal(makeRaw()).id).toBe('je-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Monthly payroll')
  })

  it('maps reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('PAY-2024-03')
  })

  it('maps currencyCode to currency', () => {
    expect(transformJournal(makeRaw()).currency).toBe('USD')
  })

  it('maps postedDate to postedAt', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('maps lineitem accountId', () => {
    expect(transformJournal(makeRaw()).lineItems![0].accountId).toBe('acct-001')
  })

  it('maps lineitem debitAmount', () => {
    expect(transformJournal(makeRaw()).lineItems![0].debitAmount).toBe(50000)
  })

  it('passes JournalSchema.parse without throwing', () => {
    expect(() => JournalSchema.parse(transformJournal(makeRaw()))).not.toThrow()
  })
})

describe('untransformJournal (mri-software)', () => {
  it('round-trips description', () => {
    const canonical = transformJournal(makeRaw())
    const back = untransformJournal(canonical)
    expect(back.description).toBe('Monthly payroll')
  })

  it('round-trips reference', () => {
    const canonical = transformJournal(makeRaw())
    const back = untransformJournal(canonical)
    expect(back.reference).toBe('PAY-2024-03')
  })

  it('round-trips currencyCode', () => {
    const canonical = transformJournal(makeRaw())
    const back = untransformJournal(canonical)
    expect(back.currencyCode).toBe('USD')
  })

  it('emits postedDate as YYYY-MM-DD string', () => {
    const canonical = transformJournal(makeRaw())
    const back = untransformJournal(canonical)
    expect(back.postedDate).toBe('2024-03-31')
  })
})
