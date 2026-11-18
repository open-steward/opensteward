import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ContabiliumJournal } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/journal'

function makeJournal(overrides: Partial<ContabiliumJournal> = {}): ContabiliumJournal {
  return {
    id: 12,
    descripcion: 'Ajuste mensual',
    fecha: '2024-01-31',
    referencia: 'REF-AJ-001',
    lineas: [
      { cuentaId: '4001', debe: 8000, haber: 0, descripcion: 'Ventas', centroCostoId: 'CC1' },
      { cuentaId: '1001', debe: 0, haber: 8000, descripcion: 'Banco', centroCostoId: '' },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id to string', () => {
    expect(transformJournal(makeJournal()).id).toBe('12')
  })

  it('maps descripcion to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Ajuste mensual')
  })

  it('maps referencia to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('REF-AJ-001')
  })

  it('maps fecha to postedAt as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps lineas to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)
    expect(j.lineItems![0].accountId).toBe('4001')
    expect(j.lineItems![0].debitAmount).toBe(8000)
    expect(j.lineItems![0].creditAmount).toBeUndefined()
    expect(j.lineItems![1].accountId).toBe('1001')
    expect(j.lineItems![1].creditAmount).toBe(8000)
    expect(j.lineItems![1].debitAmount).toBeUndefined()
  })

  it('maps centroCostoId to groupId', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems![0].groupId).toBe('CC1')
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
