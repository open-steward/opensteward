import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type OmieCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/creditmemo'

function makeRaw(overrides: Partial<OmieCreditMemo> = {}): OmieCreditMemo {
  return {
    codigo_lancamento: 30,
    numero_nota: 'CN-030',
    codigo_cliente: 5,
    data_emissao: '2024-03-15',
    data_vencimento: '2024-04-15',
    valor_total: 400,
    valor_imposto: 40,
    saldo: 400,
    valor_pago: 0,
    moeda: 'BRL',
    status: 'ABERTO',
    cancelada: 'N',
    itens: [],
    ...overrides,
  }
}

describe('omie transformCreditMemo', () => {
  it('maps codigo_lancamento to id as string', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('30')
  })

  it('maps cancelada=S to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ cancelada: 'S' })).status).toBe('VOIDED')
  })

  it('maps status=PAGO to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'PAGO' })).status).toBe('PAID')
  })

  it('maps saldo=0 to PAID', () => {
    expect(transformCreditMemo(makeRaw({ saldo: 0 })).status).toBe('PAID')
  })

  it('maps partial payment to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeRaw({ valor_pago: 100, saldo: 300 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
