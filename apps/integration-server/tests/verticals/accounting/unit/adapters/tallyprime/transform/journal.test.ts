import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type TallyJournal,
  type TallyJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/journal'

function makeJournalEntry(overrides: Partial<TallyJournalEntry> = {}): TallyJournalEntry {
  return {
    LEDGERNAME: 'Cash',
    AMOUNT: '1000',
    ISDEEMEDPOSITIVE: 'Yes',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<TallyJournal> = {}): TallyJournal {
  return {
    GUID: 'a1b2c3d4-e5f6-4789-9abc-def012345678',
    MASTERID: '9001',
    VOUCHERNUMBER: 'JNL/2024/001',
    DATE: '20240630',
    NARRATION: 'Month-end adjustment',
    ALLLEDGERENTRIES: [makeJournalEntry()],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps GUID to id', () => {
    expect(transformJournal(makeJournal()).id).toBe('a1b2c3d4-e5f6-4789-9abc-def012345678')
  })

  it('falls back to MASTERID when GUID is empty', () => {
    expect(transformJournal(makeJournal({ GUID: '' })).id).toBe('9001')
  })

  it('maps VOUCHERNUMBER to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JNL/2024/001')
  })

  it('maps NARRATION to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Month-end adjustment')
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-06-30'))
  })

  it('maps ISDEEMEDPOSITIVE Yes to debitAmount', () => {
    const result = transformJournal(makeJournal({ ALLLEDGERENTRIES: [makeJournalEntry({ ISDEEMEDPOSITIVE: 'Yes', AMOUNT: '1000' })] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].debitAmount).toBe(1000)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
  })

  it('maps ISDEEMEDPOSITIVE No to creditAmount', () => {
    const result = transformJournal(makeJournal({ ALLLEDGERENTRIES: [makeJournalEntry({ ISDEEMEDPOSITIVE: 'No', AMOUNT: '-800' })] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].creditAmount).toBe(800)
    expect(result.lineItems[0].debitAmount).toBeUndefined()
  })

  it('maps LEDGERNAME to lineitem accountId', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].accountId).toBe('Cash')
  })

  it('produces correct number of lineItems', () => {
    const journal = makeJournal({
      ALLLEDGERENTRIES: [
        makeJournalEntry({ LEDGERNAME: 'Cash', ISDEEMEDPOSITIVE: 'Yes' }),
        makeJournalEntry({ LEDGERNAME: 'Sales', ISDEEMEDPOSITIVE: 'No', AMOUNT: '-1000' }),
      ],
    })
    expect(transformJournal(journal).lineItems).toHaveLength(2)
  })

  it('produces empty lineItems when ALLLEDGERENTRIES is absent', () => {
    const result = transformJournal(makeJournal({ ALLLEDGERENTRIES: undefined }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('sets postedAt to undefined when DATE is invalid', () => {
    expect(transformJournal(makeJournal({ DATE: 'not-a-date' })).postedAt).toBeUndefined()
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
