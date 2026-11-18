import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ChipaxJournal } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/journal'

function makeJournal(overrides: Partial<ChipaxJournal> = {}): ChipaxJournal {
  return {
    id: 500,
    descripcion: 'Asiento de apertura',
    fechaTransaccion: '2025-01-01',
    referencia: 'AP-2025',
    lineas: [
      {
        cuentaId: '1100',
        debe: 100000,
        haber: 0,
        descripcion: 'Caja',
        centroId: 'CC-01',
      },
      {
        cuentaId: '3100',
        debe: 0,
        haber: 100000,
        descripcion: 'Capital',
        centroId: 'CC-01',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('500')
    expect(result.description).toBe('Asiento de apertura')
    expect(result.reference).toBe('AP-2025')
    expect(result.postedAt).toEqual(new Date('2025-01-01'))
  })

  it('maps journal line items', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('1100')
    expect(result.lineItems![0].debitAmount).toBe(100000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].creditAmount).toBe(100000)
    expect(result.lineItems![0].groupId).toBe('CC-01')
  })

  it('handles empty lineas', () => {
    const result = transformJournal(makeJournal({ lineas: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined description when descripcion is empty', () => {
    const result = transformJournal(makeJournal({ descripcion: '' }))
    expect(result.description).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
