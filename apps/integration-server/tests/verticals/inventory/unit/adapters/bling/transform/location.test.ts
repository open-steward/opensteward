import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawBlingDeposito,
} from '../../../../../../../src/verticals/inventory/adapters/bling/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('bling transformLocation', () => {
  const raw: RawBlingDeposito = {
    id: 42,
    descricao: 'Depósito Principal',
    situacao: 1,
    padrao: true,
    desconsiderarSaldo: false,
  }

  it('maps id as string', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from descricao', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Depósito Principal')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive true when situacao is 1', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when situacao is 2', () => {
    const result = transformLocation({ ...raw, situacao: 2 })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when situacao is absent', () => {
    const result = transformLocation({ id: 43 })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to bling', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('bling')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
