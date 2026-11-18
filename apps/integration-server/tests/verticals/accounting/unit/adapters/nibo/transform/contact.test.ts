import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type NiboContact } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/contact'

function makeRaw(overrides: Partial<NiboContact> = {}): NiboContact {
  return {
    contactId: 1,
    name: 'Cliente Teste',
    tradeName: 'Teste',
    cpfCnpj: '12.345.678/0001-99',
    stateRegistration: '',
    email: 'teste@empresa.com.br',
    phone: '1134567890',
    cellPhone: '',
    street: 'Avenida Paulista',
    number: '1000',
    complement: '',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    zipCode: '01310-100',
    state: 'SP',
    country: 'BR',
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    ...overrides,
  }
}

describe('nibo transformContact', () => {
  it('maps contactId to id as string', () => {
    expect(transformContact(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })
  it('maps isCustomer and isSupplier', () => {
    const result = transformContact(makeRaw({ isCustomer: false, isSupplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })
  it('maps cpfCnpj to identification', () => {
    expect(transformContact(makeRaw()).identification).toBe('12.345.678/0001-99')
  })
  it('maps isActive', () => {
    expect(transformContact(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
