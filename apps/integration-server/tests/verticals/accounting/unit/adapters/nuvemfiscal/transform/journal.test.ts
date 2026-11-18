import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type NuvemFiscalLancamento } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/journal'

function makeRaw(overrides: Partial<NuvemFiscalLancamento> = {}): NuvemFiscalLancamento {
  return {
    id_lancamento: 50,
    numero: 1,
    descricao: 'Lançamento contábil',
    data_lancamento: '2024-04-01',
    referencia: 'REF-001',
    linhas: [],
    ...overrides,
  }
}

describe('nuvemfiscal transformJournal', () => {
  it('maps id_lancamento to id as string', () => {
    expect(transformJournal(makeRaw()).id).toBe('50')
  })

  it('maps descricao to description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Lançamento contábil')
  })

  it('maps referencia to reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('REF-001')
  })

  it('maps data_lancamento to postedAt as Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps linhas to lineItems', () => {
    const raw = makeRaw({
      linhas: [{ id_conta: 1, debito: 100, credito: 0, descricao: 'Débito', centro_custo: 'CC1', projeto: 'P1' }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(100)
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
