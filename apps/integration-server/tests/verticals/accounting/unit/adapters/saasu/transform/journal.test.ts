/** Saasu journal → Journal, over the documented GET Journals / Journal/{id} samples. */
import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/journal'
import { journalDetail, journalSummary } from '../fixtures'

describe('transformJournal (saasu)', () => {
  it('maps a summary row, leaving lineItems unset', () => {
    const j = JournalSchema.parse(transformJournal(journalSummary()))
    expect(j).toMatchObject({
      id: '5093684',
      description: 'Test Journal entry 1',
      reference: '123',
      currency: 'AUD',
      postedAt: '2015-01-24',
    })
    expect(j.lineItems).toBeUndefined()
  })

  it('maps detail Items to debit and credit in minor units', () => {
    const j = JournalSchema.parse(
      transformJournal(
        journalDetail({
          Items: [
            { Type: 'Credit', AccountId: 321, Amount: 10.0 },
            { Type: 'Debit', AccountId: 400, Amount: 10.0 },
          ],
        }),
      ),
    )
    expect(j.lineItems).toEqual([
      { accountId: '321', creditAmount: 1000, debitAmount: undefined },
      { accountId: '400', debitAmount: 1000, creditAmount: undefined },
    ])
  })
})
