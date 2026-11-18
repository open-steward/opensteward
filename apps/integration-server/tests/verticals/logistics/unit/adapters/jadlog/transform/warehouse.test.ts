/**
 * Fixture: the "Estrutura do JSON retornado" example of Jadlog's "Consulta
 * Pickup Points Diário" (Documento de Integração v2.3, p. 28), with field
 * meanings from "Descrição dos Campos" (p. 27).
 * https://www.jadlog.com.br/jadlog/arquivos/api_integracao.pdf
 */
import { describe, it, expect } from 'vitest'
import { transformWarehouse } from '../../../../../../../src/verticals/logistics/adapters/jadlog/transform/warehouse'
import { documentedPudo } from '../fixtures'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

describe('jadlog transformWarehouse (documented PUDO example)', () => {
  it('parses with WarehouseSchema and maps the documented fields', () => {
    const w = WarehouseSchema.parse(transformWarehouse(documentedPudo()))
    expect(w.id).toBe('BR10598')
    expect(w.code).toBe('BR10598')
    expect(w.name).toBe('CO JADLOG - ESTEIO 01')
    expect(w.isActive).toBe(true)
    expect(w.createdAt?.toISOString()).toBe('2018-05-30T11:24:56.000Z')
    expect(w.address).toEqual({
      street1: 'RUA 24 DE AGOSTO, 755',
      street2: 'CENTRO',
      city: 'ESTEIO',
      state: 'RS',
      postalCode: '93265160',
      country: 'BR',
    })
  })

  it('ativo "N" is inactive; an undocumented value is omitted', () => {
    expect(WarehouseSchema.parse(transformWarehouse(documentedPudo({ ativo: 'N' }))).isActive).toBe(
      false,
    )
    expect(transformWarehouse(documentedPudo({ ativo: 'X' })).isActive).toBeUndefined()
  })

  it('pais other than the documented "BRA" is omitted, never guessed', () => {
    const [e] = documentedPudo().pudoEnderecoList!
    const w = transformWarehouse(documentedPudo({ pudoEnderecoList: [{ ...e, pais: 'XYZ' }] }))
    expect(w.address?.country).toBeUndefined()
    expect(w.address?.city).toBe('ESTEIO')
    expect(() => WarehouseSchema.parse(w)).not.toThrow()
  })

  it('street2 comes from compl2 ("Complemento"), not bairro', () => {
    const [e] = documentedPudo().pudoEnderecoList!
    const w = transformWarehouse(
      documentedPudo({ pudoEnderecoList: [{ ...e, bairro: 'VILA NOVA', compl2: 'SALA 2' }] }),
    )
    expect(WarehouseSchema.parse(w).address?.street2).toBe('SALA 2')
  })

  it('an address entry with no mapped field yields no address', () => {
    const w = transformWarehouse(
      documentedPudo({
        pudoEnderecoList: [{ latitude: -29.85, longitude: -51.18, idioma: 'POR' }],
      }),
    )
    expect(w.address).toBeUndefined()
    expect(() => WarehouseSchema.parse(w)).not.toThrow()
  })

  it('no address list means no address', () => {
    const w = transformWarehouse(documentedPudo({ pudoEnderecoList: [] }))
    expect(w.address).toBeUndefined()
    expect(() => WarehouseSchema.parse(w)).not.toThrow()
  })

  it('throws rather than inventing an id when pudoId is missing', () => {
    expect(() => transformWarehouse(documentedPudo({ pudoId: null }))).toThrow(/pudoId/)
  })
})
