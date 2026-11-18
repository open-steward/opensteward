import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type VhsysContaBancaria,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeContaBancaria(overrides: Partial<VhsysContaBancaria> = {}): VhsysContaBancaria {
  return {
    id_conta: 3,
    nome_conta: 'Conta Corrente',
    banco: 'Bradesco',
    agencia: '1234',
    conta: '56789-0',
    situacao: 'A',
    saldo_inicial: '5000.00',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeContaBancaria())
    expect(result.id).toBe('3')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(500000)
  })

  it('builds name from nome_conta with agencia and conta', () => {
    const result = transformAccount(makeContaBancaria())
    expect(result.name).toContain('Conta Corrente')
    expect(result.name).toContain('ag 1234')
    expect(result.name).toContain('cc 56789-0')
  })

  it('falls back to banco when nome_conta absent', () => {
    const result = transformAccount(makeContaBancaria({ nome_conta: undefined }))
    expect(result.name).toContain('Bradesco')
  })

  it('maps situacao I to ARCHIVED', () => {
    const result = transformAccount(makeContaBancaria({ situacao: 'I' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('converts saldo_inicial to minor units', () => {
    const result = transformAccount(makeContaBancaria({ saldo_inicial: '1234.56' }))
    expect(result.balance).toBe(123456)
  })

  it('passes raw as metadata', () => {
    const raw = makeContaBancaria()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformAccount(makeContaBancaria())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
