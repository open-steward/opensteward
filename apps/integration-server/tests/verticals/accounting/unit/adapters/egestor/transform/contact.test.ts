import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type EgestorContato,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<EgestorContato> = {}): EgestorContato {
  return {
    codigo: '101',
    nome: 'Acme Ltda',
    fantasia: 'Acme',
    cpfcnpj: '12.345.678/0001-99',
    tipo: ['cliente'],
    emails: ['billing@acme.com.br'],
    fones: ['+55-11-9999-0001'],
    logradouro: 'Rua das Flores',
    numero: '100',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '01310-100',
    pais: 'Brasil',
    ...overrides,
  }
}

describe('egestor transformContact', () => {
  it('maps codigo to id as string', () => {
    const result = transformContact(makeRaw({ codigo: 999 }))
    expect(result.id).toBe('999')
  })

  it('uses fantasia as name when present', () => {
    const result = transformContact(makeRaw({ fantasia: 'Brand Name', nome: 'Legal Name' }))
    expect(result.name).toBe('Brand Name')
  })

  it('falls back to nome when fantasia absent', () => {
    const result = transformContact(makeRaw({ fantasia: undefined, nome: 'Legal Name' }))
    expect(result.name).toBe('Legal Name')
  })

  it('tipo includes cliente → isCustomer=true', () => {
    const result = transformContact(makeRaw({ tipo: ['cliente'] }))
    expect(result.isCustomer).toBe(true)
  })

  it('tipo includes fornecedor → isSupplier=true', () => {
    const result = transformContact(makeRaw({ tipo: ['fornecedor'] }))
    expect(result.isSupplier).toBe(true)
  })

  it('tipo includes both → isCustomer and isSupplier true', () => {
    const result = transformContact(makeRaw({ tipo: ['cliente', 'fornecedor'] }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps emails array to emails', () => {
    const result = transformContact(makeRaw({ emails: ['a@b.com'] }))
    expect(result.emails).toHaveLength(1)
    expect(result.emails?.[0]?.email).toBe('a@b.com')
  })

  it('maps fones array to telephones', () => {
    const result = transformContact(makeRaw({ fones: ['+55-11-1234-5678'] }))
    expect(result.telephones).toHaveLength(1)
  })

  it('builds billingAddress from logradouro + numero', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('Rua das Flores, 100')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
