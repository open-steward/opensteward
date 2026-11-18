import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawTinyErpContato,
} from '../../../../../../../src/verticals/inventory/adapters/tiny-erp/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier', () => {
  const baseRaw: RawTinyErpContato = {
    id: 7,
    nome: 'Fornecedor Alpha',
    codigo: 'FA-001',
    fantasia: 'Alpha Supplies',
    tipoPessoa: 'J',
    cpfCnpj: '12.345.678/0001-99',
    telefone: '+55 11 9999-0001',
    celular: '+55 11 98888-0002',
    email: 'orders@alpha.example.com',
    situacao: 'A',
    dataCriacao: '2024-03-01T00:00:00Z',
    dataAtualizacao: '2024-03-15T00:00:00Z',
    tipos: [{ id: 1, descricao: 'Fornecedor' }],
    endereco: {
      endereco: 'Rua das Flores',
      numero: '123',
      complemento: 'Sala 4',
      bairro: 'Centro',
      municipio: 'São Paulo',
      cep: '01310-100',
      uf: 'SP',
      pais: 'Brasil',
    },
  }

  it('maps id and externalId to String(raw.id)', () => {
    const result = transformSupplier(baseRaw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps nome to name', () => {
    const result = transformSupplier(baseRaw)
    expect(result.name).toBe('Fornecedor Alpha')
  })

  it('returns empty string for name when nome is absent', () => {
    const raw: RawTinyErpContato = { id: 1 }
    const result = transformSupplier(raw)
    expect(result.name).toBe('')
  })

  it('maps email from raw.email', () => {
    const result = transformSupplier(baseRaw)
    expect(result.email).toBe('orders@alpha.example.com')
  })

  it('maps phone from telefone (preferred over celular)', () => {
    const result = transformSupplier(baseRaw)
    expect(result.phone).toBe('+55 11 9999-0001')
  })

  it('falls back to celular when telefone is absent', () => {
    const raw: RawTinyErpContato = { ...baseRaw, telefone: undefined }
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+55 11 98888-0002')
  })

  it('hardcodes defaultCurrency to "BRL"', () => {
    const result = transformSupplier(baseRaw)
    expect(result.defaultCurrency).toBe('BRL')
  })

  it('sets platform to "tiny-erp"', () => {
    const result = transformSupplier(baseRaw)
    expect(result.platform).toBe('tiny-erp')
  })

  describe('isActive from situacao', () => {
    it('maps situacao "A" to isActive true', () => {
      expect(transformSupplier({ ...baseRaw, situacao: 'A' }).isActive).toBe(true)
    })

    it('maps situacao "B" to isActive true', () => {
      expect(transformSupplier({ ...baseRaw, situacao: 'B' }).isActive).toBe(true)
    })

    it('maps situacao "I" to isActive false', () => {
      expect(transformSupplier({ ...baseRaw, situacao: 'I' }).isActive).toBe(false)
    })

    it('maps situacao "E" to isActive false (excluído)', () => {
      expect(transformSupplier({ ...baseRaw, situacao: 'E' }).isActive).toBe(false)
    })

    it('defaults isActive to true for unknown situacao', () => {
      expect(transformSupplier({ ...baseRaw, situacao: 'X' }).isActive).toBe(true)
    })

    it('defaults isActive to true when situacao is absent', () => {
      const raw: RawTinyErpContato = { id: 1 }
      expect(transformSupplier(raw).isActive).toBe(true)
    })
  })

  describe('metadata', () => {
    it('stores codigo in metadata', () => {
      const result = transformSupplier(baseRaw)
      expect(result.metadata['codigo']).toBe('FA-001')
    })

    it('stores fantasia in metadata', () => {
      const result = transformSupplier(baseRaw)
      expect(result.metadata['fantasia']).toBe('Alpha Supplies')
    })

    it('stores cpfCnpj in metadata', () => {
      const result = transformSupplier(baseRaw)
      expect(result.metadata['cpfCnpj']).toBe('12.345.678/0001-99')
    })

    it('stores endereco address fields in metadata', () => {
      const result = transformSupplier(baseRaw)
      expect(result.metadata['endereco']).toBe('Rua das Flores')
      expect(result.metadata['municipio']).toBe('São Paulo')
      expect(result.metadata['uf']).toBe('SP')
      expect(result.metadata['cep']).toBe('01310-100')
    })

    it('stores tipoPessoa in metadata', () => {
      const result = transformSupplier(baseRaw)
      expect(result.metadata['tipoPessoa']).toBe('J')
    })
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(baseRaw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })

  it('passes SupplierSchema validation with minimal input (no email)', () => {
    const raw: RawTinyErpContato = { id: 99, nome: 'Minimal Supplier', situacao: 'A' }
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
