import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type OmieJournal } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/journal'

function makeRaw(overrides: Partial<OmieJournal> = {}): OmieJournal {
  return {
    codigo_lancamento: 75,
    descricao: 'Lançamento Omie',
    data_lancamento: '2024-05-01',
    referencia: 'REF-075',
    linhas: [],
    ...overrides,
  }
}

describe('omie transformJournal', () => {
  it('maps codigo_lancamento to id as string', () => {
    expect(transformJournal(makeRaw()).id).toBe('75')
  })

  it('maps descricao to description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Lançamento Omie')
  })

  it('maps referencia to reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('REF-075')
  })

  it('maps data_lancamento to postedAt as Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('maps linhas to lineItems', () => {
    const raw = makeRaw({
      linhas: [{ conta_contabil: 10, valor_debito: 200, valor_credito: 0, descricao: 'Débito', centro_custo: '', projeto: '' }],
    })
    expect(transformJournal(raw).lineItems).toHaveLength(1)
    expect(transformJournal(raw).lineItems![0].debitAmount).toBe(200)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
