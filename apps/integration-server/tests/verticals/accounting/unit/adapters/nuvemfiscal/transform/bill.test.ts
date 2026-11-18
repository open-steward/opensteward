import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type NuvemFiscalBill } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/bill'

function makeRaw(overrides: Partial<NuvemFiscalBill> = {}): NuvemFiscalBill {
  return {
    id_fatura_fornecedor: 10,
    numero_fatura: 'FAT-001',
    id_fornecedor: 5,
    nome_fornecedor: 'Fornecedor X',
    valor_total: 1000,
    valor_impostos: 100,
    saldo: 1000,
    moeda: 'BRL',
    data_emissao: '2024-01-15',
    data_vencimento: '2024-02-15',
    status: 'pendente',
    cancelada: false,
    ...overrides,
  }
}

describe('nuvemfiscal transformBill', () => {
  it('maps id_fatura_fornecedor to id as string', () => {
    expect(transformBill(makeRaw()).id).toBe('10')
  })

  it('maps numero_fatura to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('FAT-001')
  })

  it('maps id_fornecedor to contactId as string', () => {
    expect(transformBill(makeRaw()).contactId).toBe('5')
  })

  it('maps moeda to currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('BRL')
  })

  it('maps status cancelada=true to VOIDED', () => {
    expect(transformBill(makeRaw({ cancelada: true })).status).toBe('VOIDED')
  })

  it('maps saldo=0 with valor_total>0 to PAID', () => {
    expect(transformBill(makeRaw({ saldo: 0, valor_total: 1000 })).status).toBe('PAID')
  })

  it('maps partial saldo to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ saldo: 500, valor_total: 1000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status=autorizada to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'autorizada' })).status).toBe('AUTHORIZED')
  })

  it('maps data_emissao to postedAt as Date', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps data_vencimento to dueAt as Date', () => {
    const result = transformBill(makeRaw())
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
