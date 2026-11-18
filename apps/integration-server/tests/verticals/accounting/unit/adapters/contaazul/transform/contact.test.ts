import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ContaAzulContact } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/contact'

function makeContact(overrides: Partial<ContaAzulContact> = {}): ContaAzulContact {
  return {
    id: 'con-001',
    name: 'Maria Silva',
    company_name: 'Silva Ltda',
    cnpj: '12.345.678/0001-90',
    cpf: '',
    email: 'maria@silva.com.br',
    phone: '1132345678',
    mobile_phone: '11987654321',
    active: true,
    person_type: 'LEGAL',
    address: 'Rua Augusta 500',
    complement: 'Sala 301',
    city: 'Sao Paulo',
    state: 'SP',
    postal_code: '01304-000',
    country: 'BR',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('con-001')
    expect(result.name).toBe('Silva Ltda')
    expect(result.companyName).toBe('Silva Ltda')
    expect(result.identification).toBe('12.345.678/0001-90')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
  })

  it('maps telephones', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0]).toEqual({ telephone: '1132345678', type: 'WORK' })
    expect(result.telephones![1]).toEqual({ telephone: '11987654321', type: 'MOBILE' })
  })

  it('uses cpf when cnpj is empty', () => {
    const result = transformContact(makeContact({ cnpj: '', cpf: '123.456.789-00' }))
    expect(result.identification).toBe('123.456.789-00')
  })

  it('maps billing address with complement', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Rua Augusta 500')
    expect(result.billingAddress?.city).toBe('Sao Paulo')
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
