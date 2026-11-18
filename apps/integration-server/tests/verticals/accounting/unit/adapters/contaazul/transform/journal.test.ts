import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ContaAzulJournal } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/journal'

function makeJournal(overrides: Partial<ContaAzulJournal> = {}): ContaAzulJournal {
  return {
    id: 'jrn-001',
    description: 'Lancamento de fechamento',
    reference: 'REF-2025-03',
    date: '2025-03-31',
    entries: [
      { account_id: 'acc-10', description: 'Debito', debit: 8000, credit: 0, cost_center_id: 'cc-1', project_id: 'prj-1' },
      { account_id: 'acc-20', description: 'Credito', debit: 0, credit: 8000, cost_center_id: 'cc-1', project_id: 'prj-1' },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('jrn-001')
    expect(result.description).toBe('Lancamento de fechamento')
    expect(result.reference).toBe('REF-2025-03')
  })

  it('maps date', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2025-03-31'))
  })

  it('maps journal line items', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems?.[0].accountId).toBe('acc-10')
    expect(result.lineItems?.[0].debitAmount).toBe(8000)
    expect(result.lineItems?.[0].groupId).toBe('cc-1')
    expect(result.lineItems?.[0].projectId).toBe('prj-1')
    expect(result.lineItems?.[1].creditAmount).toBe(8000)
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
