import { describe, it, expect } from 'vitest'
import {
  transformCliente,
  transformFornecedor,
  type VhsysCliente,
  type VhsysFornecedor,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCliente(overrides: Partial<VhsysCliente> = {}): VhsysCliente {
  return {
    id_cliente: 101,
    razao_cliente: 'Empresa Alpha',
    fantasia_cliente: 'Alpha',
    tipo_pessoa: 'J',
    cnpj_cliente: '12.345.678/0001-90',
    email_cliente: 'alpha@example.com',
    fone_cliente: '+551132320000',
    celular_cliente: '+5511999990000',
    endereco_cliente: 'Av Paulista',
    numero_cliente: '1234',
    cidade_cliente: 'São Paulo',
    uf_cliente: 'SP',
    cep_cliente: '01310-100',
    situacao_cliente: 'A',
    data_cad_cliente: '2023-05-10',
    ...overrides,
  }
}

function makeFornecedor(overrides: Partial<VhsysFornecedor> = {}): VhsysFornecedor {
  return {
    id_fornecedor: 202,
    razao_fornecedor: 'Fornecedor Beta',
    fantasia_fornecedor: 'Beta',
    tipo_pessoa: 'J',
    cnpj_fornecedor: '98.765.432/0001-10',
    email_fornecedor: 'beta@example.com',
    fone_fornecedor: '+551198765432',
    cidade_fornecedor: 'Rio de Janeiro',
    uf_fornecedor: 'RJ',
    situacao_fornecedor: 'A',
    ...overrides,
  }
}

describe('transformCliente', () => {
  it('maps core fields correctly', () => {
    const result = transformCliente(makeCliente())
    expect(result.id).toBe('101')
    expect(result.name).toBe('Empresa Alpha')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps CNPJ as identification for legal entity', () => {
    const result = transformCliente(makeCliente())
    expect(result.identification).toBe('12.345.678/0001-90')
  })

  it('maps CPF as identification for individual', () => {
    const result = transformCliente(
      makeCliente({ tipo_pessoa: 'F', cpf_cliente: '123.456.789-00' }),
    )
    expect(result.identification).toBe('123.456.789-00')
  })

  it('maps email and telephones', () => {
    const result = transformCliente(makeCliente())
    expect(result.emails![0].email).toBe('alpha@example.com')
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('MOBILE')
  })

  it('sets isActive=false for situacao_cliente=I', () => {
    const result = transformCliente(makeCliente({ situacao_cliente: 'I' }))
    expect(result.isActive).toBe(false)
  })

  it('produces a schema-valid result', () => {
    const result = transformCliente(makeCliente())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformFornecedor', () => {
  it('prefixes id with supp_', () => {
    const result = transformFornecedor(makeFornecedor())
    expect(result.id).toBe('supp_202')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformFornecedor(makeFornecedor())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps razao_fornecedor as name', () => {
    const result = transformFornecedor(makeFornecedor({ razao_fornecedor: 'Supplier X' }))
    expect(result.name).toBe('Supplier X')
  })

  it('maps CNPJ as identification', () => {
    const result = transformFornecedor(makeFornecedor())
    expect(result.identification).toBe('98.765.432/0001-10')
  })

  it('produces a schema-valid result', () => {
    const result = transformFornecedor(makeFornecedor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
