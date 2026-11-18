import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawBlingContato,
} from '../../../../../../../src/verticals/inventory/adapters/bling/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('bling transformSupplier', () => {
  const raw: RawBlingContato = {
    id: 200,
    nome: 'Distribuidora ABC Ltda',
    codigo: 'FOR-001',
    fantasia: 'ABC Dist',
    situacao: 1,
    email: 'compras@abcdist.example.com',
    telefone: '+5511987654321',
    tipo: 'J',
    numeroDocumento: '12.345.678/0001-99',
    endereco: {
      geral: {
        endereco: 'Rua das Flores, 100',
        cep: '01310-100',
        bairro: 'Centro',
        municipio: 'São Paulo',
        uf: 'SP',
        numero: '100',
        complemento: 'Apto 1',
      },
    },
  }

  it('maps id as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps name from nome', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Distribuidora ABC Ltda')
  })

  it('falls back to fantasia when nome is absent', () => {
    const result = transformSupplier({ ...raw, nome: undefined })
    expect(result.name).toBe('ABC Dist')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('compras@abcdist.example.com')
  })

  it('maps phone from telefone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+5511987654321')
  })

  it('falls back to celular when telefone is absent', () => {
    const result = transformSupplier({ ...raw, telefone: undefined, celular: '+5511888888888' })
    expect(result.phone).toBe('+5511888888888')
  })

  it('sets isActive true when situacao is 1', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when situacao is 2', () => {
    const result = transformSupplier({ ...raw, situacao: 2 })
    expect(result.isActive).toBe(false)
  })

  it('sets defaultCurrency to BRL', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('BRL')
  })

  it('sets platform to bling', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('bling')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
