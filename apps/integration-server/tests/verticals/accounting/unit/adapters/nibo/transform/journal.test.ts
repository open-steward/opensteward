import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type NiboJournal } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/journal'

function makeRaw(overrides: Partial<NiboJournal> = {}): NiboJournal {
  return {
    journalId: 1,
    description: 'Lançamento geral',
    postDate: '2024-04-01',
    reference: 'REF-001',
    lines: [],
    ...overrides,
  }
}

describe('nibo transformJournal', () => {
  it('maps journalId to id as string', () => {
    expect(transformJournal(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })
  it('maps postDate to postedAt as Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-04-01'))
  })
  it('maps lines to lineItems', () => {
    const raw = makeRaw({
      lines: [{ accountId: 1, debitValue: 300, creditValue: 0, description: 'Debit', costCenterId: '', projectId: '' }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(300)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
