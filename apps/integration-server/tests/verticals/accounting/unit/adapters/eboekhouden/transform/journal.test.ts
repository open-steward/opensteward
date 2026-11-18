import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type EBoekhoudenMutation } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/journal'

function makeMutation(overrides: Partial<EBoekhoudenMutation> = {}): EBoekhoudenMutation {
  return {
    id: 100,
    date: '2024-03-15',
    description: 'Salaris betaling',
    reference: 'REF-001',
    lines: [
      { id: 1, ledgerId: 10, description: 'Salaris', debit: 3000, credit: 0, amount: 3000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (eboekhouden)', () => {
  it('maps id to string', () => {
    expect(transformJournal(makeMutation()).id).toBe('100')
  })

  it('maps description and reference', () => {
    const result = transformJournal(makeMutation())
    expect(result.description).toBe('Salaris betaling')
    expect(result.reference).toBe('REF-001')
  })

  it('maps postedAt from date', () => {
    expect(transformJournal(makeMutation()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps lineItems', () => {
    const result = transformJournal(makeMutation())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.debitAmount).toBe(3000)
  })

  it('handles no lines', () => {
    expect(transformJournal(makeMutation({ lines: [] })).lineItems).toHaveLength(0)
  })

  it('passes raw object as metadata', () => {
    const raw = makeMutation()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeMutation())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
