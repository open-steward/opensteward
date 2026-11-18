import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MoneybirdJournal } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/journal'

function makeJournal(overrides: Partial<MoneybirdJournal> = {}): MoneybirdJournal {
  return { id: 500, description: 'Journaalpost', date: '2024-04-01', ...overrides }
}

describe('transformJournal (moneybird)', () => {
  it('maps id and description', () => {
    expect(transformJournal(makeJournal()).id).toBe('500')
    expect(transformJournal(makeJournal()).description).toBe('Journaalpost')
  })
  it('maps postedAt', () => { expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-04-01')) })
  it('passes raw as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
