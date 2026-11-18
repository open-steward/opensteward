import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawVhsysLocation,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const baseRaw: RawVhsysLocation = {
  id_deposito: '7',
  nome_deposito: 'Depósito Principal',
  sigla_deposito: 'DEP-MAIN',
  padrao_deposito: true,
  ativo_deposito: true,
  endereco_deposito: 'Rua Industrial 123',
  cidade_deposito: 'São Paulo',
  estado_deposito: 'SP',
  cep_deposito: '01310-100',
}

describe('vhsys transformLocation', () => {
  it('maps id from id_deposito', () => {
    expect(transformLocation(baseRaw).id).toBe('7')
  })

  it('maps name from nome_deposito', () => {
    expect(transformLocation(baseRaw).name).toBe('Depósito Principal')
  })

  it('maps code from sigla_deposito', () => {
    expect(transformLocation(baseRaw).code).toBe('DEP-MAIN')
  })

  it('hardcodes type to warehouse', () => {
    expect(transformLocation(baseRaw).type).toBe('warehouse')
  })

  it('maps isActive from ativo_deposito', () => {
    expect(transformLocation(baseRaw).isActive).toBe(true)
    expect(transformLocation({ ...baseRaw, ativo_deposito: false }).isActive).toBe(false)
  })

  it('maps address with country hardcoded to BR', () => {
    const result = transformLocation(baseRaw)
    expect(result.address?.line1).toBe('Rua Industrial 123')
    expect(result.address?.city).toBe('São Paulo')
    expect(result.address?.region).toBe('SP')
    expect(result.address?.country).toBe('BR')
    expect(result.address?.postalCode).toBe('01310-100')
  })

  it('sets address undefined when no address fields present', () => {
    const result = transformLocation({
      ...baseRaw,
      endereco_deposito: undefined,
      cidade_deposito: undefined,
      estado_deposito: undefined,
    })
    expect(result.address).toBeUndefined()
  })

  it('sets platform to vhsys', () => {
    expect(transformLocation(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(baseRaw))).not.toThrow()
  })
})
