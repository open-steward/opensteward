import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ColppyAsiento } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/journal'

function makeJournal(overrides: Partial<ColppyAsiento> = {}): ColppyAsiento {
  return {
    idAsiento: 700,
    numero: 1,
    descripcion: 'Asiento de apertura',
    fecha: '2025-01-01',
    referencia: 'REF-001',
    lineas: [
      {
        idCuenta: 10,
        debe: 100000,
        haber: 0,
        descripcion: 'Caja',
        centroCosto: 'CC01',
        proyecto: 'PROY-A',
      },
      {
        idCuenta: 20,
        debe: 0,
        haber: 100000,
        descripcion: 'Capital',
        centroCosto: '',
        proyecto: '',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('700')
    expect(result.description).toBe('Asiento de apertura')
    expect(result.reference).toBe('REF-001')
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal line items', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('10')
    expect(result.lineItems![0].debitAmount).toBe(100000)
    expect(result.lineItems![0].groupId).toBe('CC01')
    expect(result.lineItems![0].projectId).toBe('PROY-A')
  })

  it('maps postedAt date', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2025-01-01'))
  })

  it('handles empty lineas', () => {
    const result = transformJournal(makeJournal({ lineas: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
