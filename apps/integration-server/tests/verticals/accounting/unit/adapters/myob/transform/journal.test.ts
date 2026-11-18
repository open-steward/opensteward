import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MyobJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/journal'

function makeJournal(overrides: Partial<MyobJournalEntry> = {}): MyobJournalEntry {
  return {
    UID: 'uid-5', DisplayID: 'J-001', Memo: 'Journal entry', DateOccurred: '2024-04-01',
    Lines: [{ UID: 'l-1', Account: { UID: 'acct-1' }, Memo: 'Dr line', IsCredit: false, Amount: 500 }],
    ...overrides,
  }
}

describe('transformJournal (myob)', () => {
  it('maps id and reference', () => {
    expect(transformJournal(makeJournal()).id).toBe('uid-5')
    expect(transformJournal(makeJournal()).reference).toBe('J-001')
  })
  it('maps description', () => { expect(transformJournal(makeJournal()).description).toBe('Journal entry') })
  it('maps postedAt', () => { expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-04-01')) })
  it('maps lineItems', () => {
    const r = transformJournal(makeJournal())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems?.[0]?.debitAmount).toBe(500)
  })
  it('passes raw as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
