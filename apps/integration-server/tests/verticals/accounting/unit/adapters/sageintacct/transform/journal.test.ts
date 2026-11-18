import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type IntacctJournal,
  type IntacctJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/journal'

function makeJournalLine(overrides: Partial<IntacctJournalLine> = {}): IntacctJournalLine {
  return {
    ACCOUNTNO: '1001',
    AMOUNT: '500.00',
    TR_TYPE: '1',
    MEMO: 'Test entry',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<IntacctJournal> = {}): IntacctJournal {
  return {
    RECORDNO: 'jnl-1',
    JOURNAL: 'GJ',
    BATCH_DATE: '2024-03-01',
    DESCRIPTION: 'Monthly journal',
    ENTRIES: { GLENTRY: [makeJournalLine()] },
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps RECORDNO to id', () => {
    expect(transformJournal(makeJournal()).id).toBe('jnl-1')
  })

  it('maps DESCRIPTION to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly journal')
  })

  it('maps JOURNAL to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('GJ')
  })

  it('parses BATCH_DATE as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('sets postedAt to undefined when BATCH_DATE is empty', () => {
    expect(transformJournal(makeJournal({ BATCH_DATE: '' })).postedAt).toBeUndefined()
  })

  it('maps TR_TYPE 1 line to debitAmount', () => {
    const result = transformJournal(makeJournal())
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].debitAmount).toBe(500)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
  })

  it('maps TR_TYPE -1 line to creditAmount', () => {
    const result = transformJournal(
      makeJournal({ ENTRIES: { GLENTRY: [makeJournalLine({ TR_TYPE: '-1', AMOUNT: '500.00' })] } }),
    )
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].creditAmount).toBe(500)
    expect(result.lineItems[0].debitAmount).toBeUndefined()
  })

  it('maps line ACCOUNTNO to accountId', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].accountId).toBe('1001')
  })

  it('maps line MEMO to description', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].description).toBe('Test entry')
  })

  it('produces empty lineItems when ENTRIES has no GLENTRY', () => {
    const result = transformJournal(makeJournal({ ENTRIES: { GLENTRY: [] } }))
    expect(result.lineItems).toHaveLength(0)
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
