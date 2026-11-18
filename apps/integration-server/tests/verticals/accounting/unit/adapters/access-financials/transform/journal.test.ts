/**
 * Nominal transaction enquiry lines → Journal.
 *
 * The fixture uses the fields the "Query Transaction Details" example on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/nominal-transactions
 * selects ("auditNo ... date headerRef ... detail ... journalType debit
 * currencyDebit credit currencyCredit nominalCode ... description"). The
 * page shows no response for it; the values follow its "Get Batched
 * Nominal Transaction" response ("primaryKey": 44985, "headerReference":
 * "28", "net": 23149.92 ...).
 */
import { describe, it, expect } from 'vitest'
import { transformJournal } from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { nominalLine } from '../fixtures'

const twoLines = () => [
  nominalLine(),
  nominalLine({
    primaryKey: '44986',
    nominalCode: '2100',
    nominalPrimaryKey: 120,
    debit: 0,
    credit: 23149.92,
    detail: 'Accruals',
  }),
]

describe('transformJournal (access-financials)', () => {
  it('parses as a canonical Journal', () => {
    expect(() => JournalSchema.parse(transformJournal(twoLines()))).not.toThrow()
  })

  it('is one journal per audit number, with its lines in order', () => {
    const j = transformJournal(twoLines())
    expect(j.id).toBe('64')
    expect(j.reference).toBe('28')
    expect(j.description).toBe('March accruals')
    expect(j.source).toBe('Journal')
    expect(j.postedAt).toBe('2024-03-31')
    expect(j.lineItems).toEqual([
      { id: '44985', accountId: '310', description: 'Accrued rent' },
      { id: '44986', accountId: '120', description: 'Accruals' },
    ])
  })

  it('reports no money and no currency on the journal or its lines', () => {
    const j = transformJournal(twoLines())
    expect(j.currency).toBeUndefined()
    expect(j.taxAmount).toBeUndefined()
    for (const line of j.lineItems ?? []) {
      expect(line.debitAmount).toBeUndefined()
      expect(line.creditAmount).toBeUndefined()
    }
    expect(j.metadata).toMatchObject({ lines: [{ debit: 23149.92 }, { credit: 23149.92 }] })
  })

  it('refuses lines from two audit numbers', () => {
    expect(() => transformJournal([nominalLine(), nominalLine({ auditNo: 65 })])).toThrow(
      /more than one audit number/,
    )
  })

  it('refuses an empty group', () => {
    expect(() => transformJournal([])).toThrow(/at least one/)
  })
})
