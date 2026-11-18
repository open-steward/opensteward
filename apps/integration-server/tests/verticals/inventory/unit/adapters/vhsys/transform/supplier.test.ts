import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawVhsysSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const baseRaw: RawVhsysSupplier = {
  id_fornecedor: '42',
  razao_fornecedor: 'Keyboards Inc Ltda',
  fantasia_fornecedor: 'Keyboards Inc',
  email_fornecedor: 'orders@keyboards.example',
  fone_fornecedor: '+5511999990000',
  celular_fornecedor: '+5511888880000',
  prazo_entrega_fornecedor: 14,
  moeda_fornecedor: 'BRL',
  situacao_fornecedor: 'ativo',
  ativo_fornecedor: true,
}

describe('vhsys transformSupplier', () => {
  it('maps id from id_fornecedor', () => {
    expect(transformSupplier(baseRaw).id).toBe('42')
  })

  it('maps name from fantasia_fornecedor, falling back to razao_fornecedor', () => {
    expect(transformSupplier(baseRaw).name).toBe('Keyboards Inc')
    const result = transformSupplier({ ...baseRaw, fantasia_fornecedor: undefined })
    expect(result.name).toBe('Keyboards Inc Ltda')
  })

  it('maps email from email_fornecedor', () => {
    expect(transformSupplier(baseRaw).email).toBe('orders@keyboards.example')
  })

  it('maps phone from fone_fornecedor, falling back to celular_fornecedor', () => {
    expect(transformSupplier(baseRaw).phone).toBe('+5511999990000')
    const result = transformSupplier({ ...baseRaw, fone_fornecedor: undefined })
    expect(result.phone).toBe('+5511888880000')
  })

  it('maps defaultCurrency from moeda_fornecedor', () => {
    expect(transformSupplier(baseRaw).defaultCurrency).toBe('BRL')
  })

  it('defaults defaultCurrency to BRL when absent', () => {
    expect(transformSupplier({ ...baseRaw, moeda_fornecedor: undefined }).defaultCurrency).toBe(
      'BRL',
    )
  })

  it('maps defaultLeadTimeDays from prazo_entrega_fornecedor', () => {
    expect(transformSupplier(baseRaw).defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive true for situacao ativo', () => {
    expect(transformSupplier(baseRaw).isActive).toBe(true)
  })

  it('maps isActive false when situacao is inativo', () => {
    const result = transformSupplier({ ...baseRaw, situacao_fornecedor: 'inativo' })
    expect(result.isActive).toBe(false)
  })

  it('maps isActive false when situacao is 0', () => {
    const result = transformSupplier({
      ...baseRaw,
      situacao_fornecedor: undefined,
      ativo_fornecedor: '0',
    })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to vhsys', () => {
    expect(transformSupplier(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(baseRaw))).not.toThrow()
  })
})
