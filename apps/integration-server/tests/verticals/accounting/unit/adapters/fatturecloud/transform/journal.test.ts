import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FattureCloudJournal } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/journal'

function makeJournal(overrides: Partial<FattureCloudJournal> = {}): FattureCloudJournal {
  return { id: 20, description: 'Prima nota', date: '2024-04-01', ...overrides }
}

describe('transformJournal (fatturecloud)', () => {
  it('maps id and description', () => {
    const r = transformJournal(makeJournal())
    expect(r.id).toBe('20')
    expect(r.description).toBe('Prima nota')
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
