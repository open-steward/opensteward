import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  transformJournalRows,
  type ScopevisioPostingRow,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

const EPOCH_MS = 1704067200000 // 2024-01-01T00:00:00.000Z

function makeRow(overrides: Partial<ScopevisioPostingRow> = {}): ScopevisioPostingRow {
  return {
    rowNumber: 1,
    documentNumber: 'BJ-2024-001',
    externalDocumentNumber: 'EXT-001',
    postingDate: EPOCH_MS,
    documentText: 'Monthly accrual',
    accountNumber: '4000',
    accountName: 'Umsatzerlöse',
    amount: 1000,
    createdTs: EPOCH_MS,
    ...overrides,
  }
}

describe('transformJournal (scopevisio)', () => {
  it('maps documentNumber to id', () => {
    expect(transformJournal(makeRow()).id).toBe('BJ-2024-001')
  })

  it('maps documentText to description', () => {
    expect(transformJournal(makeRow()).description).toBe('Monthly accrual')
  })

  it('maps externalDocumentNumber to reference', () => {
    expect(transformJournal(makeRow()).reference).toBe('EXT-001')
  })

  it('converts postingDate epoch ms to Date', () => {
    expect(transformJournal(makeRow()).postedAt).toEqual(new Date(EPOCH_MS))
  })

  it('maps positive amount to debitAmount in lineitem', () => {
    const result = transformJournal(makeRow({ amount: 500 }))
    expect(result.lineItems?.[0]?.debitAmount).toBe(500)
    expect(result.lineItems?.[0]?.creditAmount).toBeUndefined()
  })

  it('maps negative amount to creditAmount in lineitem', () => {
    const result = transformJournal(makeRow({ amount: -300 }))
    expect(result.lineItems?.[0]?.creditAmount).toBe(300)
    expect(result.lineItems?.[0]?.debitAmount).toBeUndefined()
  })

  it('passes JournalSchema.parse without throwing', () => {
    expect(() => JournalSchema.parse(transformJournal(makeRow()))).not.toThrow()
  })
})

describe('transformJournalRows (scopevisio)', () => {
  it('groups multiple rows into one Journal with multiple lineItems', () => {
    const rows = [
      makeRow({ rowNumber: 1, accountNumber: '4000', amount: 1000 }),
      makeRow({ rowNumber: 2, accountNumber: '1800', amount: -1000 }),
    ]
    const result = transformJournalRows(rows)
    expect(result.id).toBe('BJ-2024-001')
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('sets accountId from accountNumber on each lineitem', () => {
    const rows = [makeRow({ accountNumber: '8400' })]
    const result = transformJournalRows(rows)
    expect(result.lineItems![0].accountId).toBe('8400')
  })

  it('passes JournalSchema.parse without throwing', () => {
    expect(() =>
      JournalSchema.parse(
        transformJournalRows([makeRow(), makeRow({ rowNumber: 2, amount: -1000 })]),
      ),
    ).not.toThrow()
  })
})
