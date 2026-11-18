import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type TinyContato,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<TinyContato> = {}): TinyContato {
  return {
    id: 123,
    nome: 'Empresa XYZ',
    codigo: 'EMP-001',
    fantasia: 'XYZ Ltda',
    tipoPessoa: 'J',
    cpfCnpj: '12.345.678/0001-90',
    email: 'contato@xyz.example',
    telefone: '+55-11-1234-5678',
    celular: '+55-11-9999-0000',
    situacao: 'B',
    dataCriacao: '2024-01-15T09:30:00.000Z',
    dataAtualizacao: '2024-02-01T14:20:00.000Z',
    endereco: {
      endereco: 'Rua das Flores',
      numero: '100',
      municipio: 'São Paulo',
      cep: '01310-100',
      uf: 'SP',
    },
    ...overrides,
  }
}

describe('tiny transformContact', () => {
  it('maps numeric id to string', () => {
    expect(transformContact(makeRaw()).id).toBe('123')
  })

  it('maps nome to name for company (tipoPessoa J)', () => {
    expect(transformContact(makeRaw({ tipoPessoa: 'J' })).name).toBe('Empresa XYZ')
  })

  it('maps codigo to identification', () => {
    expect(transformContact(makeRaw()).identification).toBe('EMP-001')
  })

  it('maps cpfCnpj to taxNumber', () => {
    expect(transformContact(makeRaw()).taxNumber).toBe('12.345.678/0001-90')
  })

  it('sets isCustomer=true', () => {
    expect(transformContact(makeRaw()).isCustomer).toBe(true)
  })

  it('sets isSupplier=true', () => {
    expect(transformContact(makeRaw()).isSupplier).toBe(true)
  })

  it('maps situacao B to isActive=true', () => {
    expect(transformContact(makeRaw({ situacao: 'B' })).isActive).toBe(true)
  })

  it('maps situacao A to isActive=true', () => {
    expect(transformContact(makeRaw({ situacao: 'A' })).isActive).toBe(true)
  })

  it('maps situacao I to isActive=false', () => {
    expect(transformContact(makeRaw({ situacao: 'I' })).isActive).toBe(false)
  })

  it('maps email to emails array with type WORK', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contato@xyz.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps telefone as WORK and celular as MOBILE', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('MOBILE')
  })

  it('maps endereco to shippingAddress', () => {
    const result = transformContact(makeRaw())
    expect(result.shippingAddress?.address1).toBe('Rua das Flores')
    expect(result.shippingAddress?.city).toBe('São Paulo')
    expect(result.shippingAddress?.region).toBe('SP')
  })

  it('maps dataCriacao to createdAt as Date', () => {
    expect(transformContact(makeRaw()).createdAt).toEqual(new Date('2024-01-15T09:30:00.000Z'))
  })

  it('maps dataAtualizacao to updatedAt as Date', () => {
    expect(transformContact(makeRaw()).updatedAt).toEqual(new Date('2024-02-01T14:20:00.000Z'))
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})
