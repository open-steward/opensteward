import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type TinyInfoConta,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<TinyInfoConta> = {}): TinyInfoConta {
  return {
    razaoSocial: 'Empresa LTDA',
    fantasia: 'Empresa Fantasy',
    cpfCnpj: '12.345.678/0001-90',
    enderecoEmpresa: {
      endereco: 'Rua Central',
      numero: '200',
      municipio: 'Rio de Janeiro',
      cep: '20040-020',
      uf: 'RJ',
    },
    fone: '+55-21-1111-2222',
    email: 'contato@empresa.example',
    ...overrides,
  }
}

describe('tiny transformOrganization', () => {
  it('maps fantasia to name (preferred over razaoSocial)', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Empresa Fantasy')
  })

  it('falls back to razaoSocial for name when fantasia absent', () => {
    expect(transformOrganization(makeRaw({ fantasia: null })).name).toBe('Empresa LTDA')
  })

  it('maps razaoSocial to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Empresa LTDA')
  })

  it('maps cpfCnpj to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('12.345.678/0001-90')
  })

  it('maps enderecoEmpresa to address', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('Rua Central')
    expect(result.address?.city).toBe('Rio de Janeiro')
    expect(result.address?.region).toBe('RJ')
    expect(result.address?.postalCode).toBe('20040-020')
  })

  it('omits address when enderecoEmpresa absent', () => {
    expect(transformOrganization(makeRaw({ enderecoEmpresa: null })).address).toBeUndefined()
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles empty input gracefully', () => {
    expect(() => transformOrganization({})).not.toThrow()
  })
})
