import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type OmieBill } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/bill'

function makeRaw(overrides: Partial<OmieBill> = {}): OmieBill {
  return {
    codigo_lancamento: 20,
    numero_documento: 'DOC-020',
    codigo_fornecedor: 7,
    data_emissao: '2024-02-01',
    data_vencimento: '2024-03-01',
    valor_documento: 800,
    valor_imposto: 80,
    saldo: 800,
    moeda: 'BRL',
    status: 'ABERTO',
    cancelada: 'N',
    ...overrides,
  }
}

describe('omie transformBill', () => {
  it('maps codigo_lancamento to id as string', () => {
    expect(transformBill(makeRaw()).id).toBe('20')
  })

  it('maps cancelada=S to VOIDED', () => {
    expect(transformBill(makeRaw({ cancelada: 'S' })).status).toBe('VOIDED')
  })

  it('maps status=PAGO to PAID', () => {
    expect(transformBill(makeRaw({ status: 'PAGO' })).status).toBe('PAID')
  })

  it('maps saldo=0 to PAID', () => {
    expect(transformBill(makeRaw({ saldo: 0 })).status).toBe('PAID')
  })

  it('maps partial saldo to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ saldo: 300, valor_documento: 800 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status=AUTORIZADO to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'AUTORIZADO', saldo: 800 })).status).toBe('AUTHORIZED')
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps data_vencimento to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-03-01'))
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
