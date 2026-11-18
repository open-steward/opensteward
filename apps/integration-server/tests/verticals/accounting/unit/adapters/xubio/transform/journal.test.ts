import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type XubioJournal } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/journal'

function makeJournal(overrides: Partial<XubioJournal> = {}): XubioJournal {
  return {
    id: 700,
    descripcion: 'Asiento de cierre',
    fecha: '2025-12-31',
    referencia: 'AC-2025',
    lineas: [
      {
        cuentaId: 100,
        debe: 5000,
        haber: 0,
        descripcion: 'Débito caja',
        centroCostoId: 'CC-1',
        proyectoId: 'PR-1',
      },
      {
        cuentaId: 200,
        debe: 0,
        haber: 5000,
        descripcion: 'Crédito banco',
        centroCostoId: 'CC-1',
        proyectoId: 'PR-1',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('700')
    expect(result.description).toBe('Asiento de cierre')
    expect(result.reference).toBe('AC-2025')
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal lines correctly', () => {
    const result = transformJournal(makeJournal())
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems[0].accountId).toBe('100')
    expect(result.lineItems[0].debitAmount).toBe(5000)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
    expect(result.lineItems[1].creditAmount).toBe(5000)
  })

  it('maps date correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2025-12-31'))
  })

  it('maps groupId and projectId from journal lines', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].groupId).toBe('CC-1')
    expect(result.lineItems?.[0].projectId).toBe('PR-1')
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
