import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FacturamaJournal } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/journal'

function makeRaw(overrides: Partial<FacturamaJournal> = {}): FacturamaJournal {
  return {
    Id: 'j-1',
    Description: 'Diario general',
    Date: '2024-04-01',
    Reference: 'REF-001',
    Lines: [],
    ...overrides,
  }
}

describe('facturama transformJournal', () => {
  it('maps Id to id', () => {
    expect(transformJournal(makeRaw()).id).toBe('j-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })
  it('maps Date to postedAt as Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-04-01'))
  })
  it('maps Lines to lineItems', () => {
    const raw = makeRaw({
      Lines: [{ AccountCode: 'acc-1', Debit: 200, Credit: 0, Description: 'Test', CostCenter: '' }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(200)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
