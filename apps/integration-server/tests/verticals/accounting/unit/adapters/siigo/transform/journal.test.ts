import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type SiigoJournal } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/journal'

function makeJournal(overrides: Partial<SiigoJournal> = {}): SiigoJournal {
  return {
    id: 900,
    description: 'Monthly closing entry',
    reference: 'REF-2025-06',
    date: '2025-06-30',
    entries: [
      { accountId: 10, description: 'Debit entry', debit: 5000, credit: 0, costCenterId: 1, projectId: 2 },
      { accountId: 20, description: 'Credit entry', debit: 0, credit: 5000, costCenterId: 1, projectId: 2 },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('900')
    expect(result.description).toBe('Monthly closing entry')
    expect(result.reference).toBe('REF-2025-06')
  })

  it('maps date', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2025-06-30'))
  })

  it('maps journal line items', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems?.[0].accountId).toBe('10')
    expect(result.lineItems?.[0].debitAmount).toBe(5000)
    expect(result.lineItems?.[0].groupId).toBe('1')
    expect(result.lineItems?.[0].projectId).toBe('2')
    expect(result.lineItems?.[1].creditAmount).toBe(5000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
