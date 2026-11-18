import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type DolibarrJournal } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/journal'

function makeRaw(overrides: Partial<DolibarrJournal> = {}): DolibarrJournal {
  return {
    rowid: 50,
    ref: 'JNL-2024-001',
    label: 'Écriture mensuelle',
    date_creation: 1705276800,
    lines: [
      { id: 1, fk_account: 401, label: 'Fournisseurs', debit: 1000, credit: 0 },
      { id: 2, fk_account: 512, label: 'Banque', debit: 0, credit: 1000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('50')
    expect(result.reference).toBe('JNL-2024-001')
    expect(result.description).toBe('Écriture mensuelle')
  })

  it('parses unix timestamp as Date', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps line items', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems?.[0].accountId).toBe('401')
    expect(result.lineItems?.[0].debitAmount).toBe(1000)
    expect(result.lineItems?.[1].creditAmount).toBe(1000)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
