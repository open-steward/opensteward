import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type BlingContato,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<BlingContato> = {}): BlingContato {
  return {
    id: 10,
    nome: 'Empresa Exemplo',
    situacao: 'A',
    tipo: 'J',
    email: 'contato@exemplo.com.br',
    telefone: '+55 11 3000-0000',
    celular: '+55 11 99999-9999',
    fantasia: 'Exemplo SA',
    tiposContato: [{ id: 1, descricao: 'Cliente' }],
    ...overrides,
  }
}

describe('transformContact (bling)', () => {
  it('maps id to string', () => {
    const result = transformContact(makeContact({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('prefers fantasia over nome for name', () => {
    const result = transformContact(makeContact({ fantasia: 'Trade Name', nome: 'Legal Name' }))
    expect(result.name).toBe('Trade Name')
  })

  it('falls back to nome when fantasia is absent', () => {
    const result = transformContact(makeContact({ fantasia: undefined, nome: 'Legal Name Only' }))
    expect(result.name).toBe('Legal Name Only')
  })

  it('sets companyName when tipo=J', () => {
    const result = transformContact(makeContact({ tipo: 'J', fantasia: 'My Corp' }))
    expect(result.companyName).toBe('My Corp')
  })

  it('omits companyName when tipo=F', () => {
    const result = transformContact(makeContact({ tipo: 'F' }))
    expect(result.companyName).toBeUndefined()
  })

  it('marks isCustomer=true when tiposContato matches /cliente/i', () => {
    const result = transformContact(
      makeContact({ tiposContato: [{ id: 1, descricao: 'Cliente' }] }),
    )
    expect(result.isCustomer).toBe(true)
  })

  it('marks isCustomer=true by default when tiposContato is empty', () => {
    const result = transformContact(makeContact({ tiposContato: [] }))
    expect(result.isCustomer).toBe(true)
  })

  it('marks isCustomer=true by default when tiposContato is undefined', () => {
    const result = transformContact(makeContact({ tiposContato: undefined }))
    expect(result.isCustomer).toBe(true)
  })

  it('marks isCustomer=false when tiposContato has no customer match', () => {
    const result = transformContact(
      makeContact({ tiposContato: [{ id: 2, descricao: 'Fornecedor' }] }),
    )
    expect(result.isCustomer).toBe(false)
  })

  it('marks isSupplier=true when tiposContato matches /fornecedor/i', () => {
    const result = transformContact(
      makeContact({ tiposContato: [{ id: 2, descricao: 'Fornecedor' }] }),
    )
    expect(result.isSupplier).toBe(true)
  })

  it('marks isSupplier=false when tiposContato is empty', () => {
    const result = transformContact(makeContact({ tiposContato: [] }))
    expect(result.isSupplier).toBe(false)
  })

  it('marks isActive=true when situacao=A', () => {
    const result = transformContact(makeContact({ situacao: 'A' }))
    expect(result.isActive).toBe(true)
  })

  it('marks isActive=true when situacao is undefined', () => {
    const result = transformContact(makeContact({ situacao: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('marks isActive=false when situacao=I', () => {
    const result = transformContact(makeContact({ situacao: 'I' }))
    expect(result.isActive).toBe(false)
  })

  it('maps email to emails array with type WORK', () => {
    const result = transformContact(makeContact({ email: 'test@example.com' }))
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0]!.email).toBe('test@example.com')
    expect(result.emails![0]!.type).toBe('WORK')
  })

  it('omits emails when email is absent', () => {
    const result = transformContact(makeContact({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('maps telefone with type WORK', () => {
    const result = transformContact(makeContact({ telefone: '11 3000-0000', celular: undefined }))
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0]!.type).toBe('WORK')
  })

  it('maps celular with type MOBILE', () => {
    const result = transformContact(makeContact({ telefone: undefined, celular: '11 99999-0000' }))
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0]!.type).toBe('MOBILE')
  })

  it('includes both telefone (WORK) and celular (MOBILE) in telephones', () => {
    const result = transformContact(
      makeContact({ telefone: '11 3000-0000', celular: '11 99999-0000' }),
    )
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0]!.type).toBe('WORK')
    expect(result.telephones![1]!.type).toBe('MOBILE')
  })

  it('passes raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('result passes ContactSchema validation', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes ContactSchema validation', () => {
    const result = transformContact({ id: 1, nome: 'Minimal' })
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
