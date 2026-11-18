import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawTinyErpDeposito,
} from '../../../../../../../src/verticals/inventory/adapters/tiny-erp/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation', () => {
  const baseRaw: RawTinyErpDeposito = {
    id: 42,
    nome: 'Depósito Central',
    descricao: 'Armazém principal',
    ativo: true,
    empresa: 'Empresa ABC',
  }

  it('maps id and externalId to String(raw.id)', () => {
    const result = transformLocation(baseRaw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps nome to name', () => {
    const result = transformLocation(baseRaw)
    expect(result.name).toBe('Depósito Central')
  })

  it('sets type to "warehouse"', () => {
    const result = transformLocation(baseRaw)
    expect(result.type).toBe('warehouse')
  })

  it('sets platform to "tiny-erp"', () => {
    const result = transformLocation(baseRaw)
    expect(result.platform).toBe('tiny-erp')
  })

  it('maps ativo true to isActive true', () => {
    const result = transformLocation({ ...baseRaw, ativo: true })
    expect(result.isActive).toBe(true)
  })

  it('maps Portuguese boolean "S" to isActive true', () => {
    const result = transformLocation({ ...baseRaw, ativo: 'S' })
    expect(result.isActive).toBe(true)
  })

  it('maps Portuguese boolean "N" to isActive false', () => {
    const result = transformLocation({ ...baseRaw, ativo: 'N' })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when ativo is absent', () => {
    const raw: RawTinyErpDeposito = { id: 1, nome: 'Test' }
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('stores descricao and empresa in metadata', () => {
    const result = transformLocation(baseRaw)
    expect(result.metadata['descricao']).toBe('Armazém principal')
    expect(result.metadata['empresa']).toBe('Empresa ABC')
  })

  it('returns empty string for name when nome is absent', () => {
    const raw: RawTinyErpDeposito = { id: 7 }
    const result = transformLocation(raw)
    expect(result.name).toBe('')
  })

  it('works with string id', () => {
    const result = transformLocation({ ...baseRaw, id: 'deposito-99' })
    expect(result.id).toBe('deposito-99')
    expect(result.externalId).toBe('deposito-99')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(baseRaw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
