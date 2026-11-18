import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type FireflyJournalResource,
} from '../../../../../../../src/verticals/accounting/adapters/firefly-iii/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(
  overrides: Partial<FireflyJournalResource['attributes']> = {},
): FireflyJournalResource {
  return {
    type: 'transactions',
    id: '7',
    attributes: {
      created_at: '2024-05-10T08:00:00.000Z',
      updated_at: '2024-05-10T09:00:00.000Z',
      user: 'user1',
      group_title: 'Office supplies purchase',
      transactions: [
        {
          transaction_journal_id: 'tj-1',
          type: 'withdrawal',
          date: '2024-05-10T00:00:00.000Z',
          amount: '75.50',
          description: 'Paper and pens',
          currency_code: 'USD',
          source_id: 'acc-100',
          source_name: 'Checking',
          source_type: 'asset',
          destination_id: 'acc-200',
          destination_name: 'Office Expenses',
          destination_type: 'expense',
          category_name: null,
          budget_name: null,
          notes: null,
          tags: null,
          reconciled: false,
        },
      ],
      ...overrides,
    },
  }
}

describe('transformJournal (firefly-iii)', () => {
  it('maps id from resource id', () => {
    expect(transformJournal(makeJournal()).id).toBe('7')
  })

  it('maps group_title to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Office supplies purchase')
  })

  it('maps group_title to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('Office supplies purchase')
  })

  it('maps first split currency_code to currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps first split date to postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-05-10T00:00:00.000Z'))
  })

  it('generates credit and debit line items from a split', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    const cr = result.lineItems!.find((li) => li.id === 'tj-1_cr')
    const dr = result.lineItems!.find((li) => li.id === 'tj-1_dr')
    expect(cr).toBeDefined()
    expect(cr!.accountId).toBe('acc-100')
    expect(cr!.creditAmount).toBe(7550)
    expect(dr).toBeDefined()
    expect(dr!.accountId).toBe('acc-200')
    expect(dr!.debitAmount).toBe(7550)
  })

  it('falls back to first split description when group_title is null', () => {
    const result = transformJournal(makeJournal({ group_title: null }))
    expect(result.description).toBe('Paper and pens')
    expect(result.reference).toBeUndefined()
  })

  it('returns empty lineItems when transactions array is empty', () => {
    const result = transformJournal(makeJournal({ transactions: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformJournal(makeJournal())
    expect(result.createdAt).toEqual(new Date('2024-05-10T08:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-05-10T09:00:00.000Z'))
  })

  it('produces a schema-valid Journal', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })
})
