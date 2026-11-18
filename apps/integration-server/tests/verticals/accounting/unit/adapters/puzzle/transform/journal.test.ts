import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type PuzzleLedgerJournal,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeRaw(overrides: Partial<PuzzleLedgerJournal> = {}): PuzzleLedgerJournal {
  return {
    id: 'jnl-pzl-1',
    createdAt: '2025-04-01T00:00:00.000Z',
    postedAt: '2025-04-01T00:00:00.000Z',
    description: 'Monthly payroll accrual',
    sequenceId: 'SEQ-001',
    entries: [
      {
        accountId: 'acct-salary',
        amount: '5000.00',
        currency: 'USD',
        description: 'Salary expense',
      },
      {
        accountId: 'acct-payable',
        amount: '-5000.00',
        currency: 'USD',
        description: 'Accrued payroll',
      },
    ],
    ...overrides,
  }
}

describe('puzzle transformJournal', () => {
  it('maps id', () => {
    expect(transformJournal(makeRaw()).id).toBe('jnl-pzl-1')
  })

  it('maps description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Monthly payroll accrual')
  })

  it('maps sequenceId to reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('SEQ-001')
  })

  it('maps postedAt to Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('falls back to effectiveAt when postedAt absent', () => {
    const raw = makeRaw({ postedAt: undefined, effectiveAt: '2025-04-02T00:00:00.000Z' })
    expect(transformJournal(raw).postedAt).toBeInstanceOf(Date)
  })

  it('maps positive amount as debitAmount in minor units', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.debitAmount).toBe(500000)
    expect(result.lineItems?.[0]?.creditAmount).toBeUndefined()
  })

  it('maps negative amount as creditAmount (absolute) in minor units', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[1]?.creditAmount).toBe(500000)
    expect(result.lineItems?.[1]?.debitAmount).toBeUndefined()
  })

  it('maps entry accountId', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.accountId).toBe('acct-salary')
  })

  it('maps entry description', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems?.[0]?.description).toBe('Salary expense')
  })

  it('passes JournalSchema.parse', () => {
    expect(() => JournalSchema.parse(transformJournal(makeRaw()))).not.toThrow()
  })
})
