import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type NuvemFiscalNotaCredito } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/creditmemo'

function makeRaw(overrides: Partial<NuvemFiscalNotaCredito> = {}): NuvemFiscalNotaCredito {
  return {
    id_nota_credito: 20,
    numero_nota: 'NC-001',
    id_cliente: 4,
    nome_cliente: 'Cliente Y',
    data_emissao: '2024-03-01',
    data_vencimento: '2024-04-01',
    valor_total: 500,
    valor_impostos: 50,
    saldo: 500,
    moeda: 'BRL',
    contabilizada: false,
    cancelada: false,
    valor_pago: 0,
    itens: [],
    ...overrides,
  }
}

describe('nuvemfiscal transformCreditMemo', () => {
  it('maps id_nota_credito to id as string', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('20')
  })

  it('maps cancelada=true to VOIDED status', () => {
    expect(transformCreditMemo(makeRaw({ cancelada: true })).status).toBe('VOIDED')
  })

  it('maps contabilizada=true with saldo=0 to PAID', () => {
    expect(transformCreditMemo(makeRaw({ contabilizada: true, saldo: 0 })).status).toBe('PAID')
  })

  it('maps contabilizada=true only to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ contabilizada: true, saldo: 500 })).status).toBe('AUTHORIZED')
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps itens to lineItems', () => {
    const raw = makeRaw({
      itens: [{ id_item: 1, descricao: 'Item A', preco_unitario: 100, quantidade: 2, valor_total: 200, valor_imposto: 20, desconto: 0, id_conta: 5 }],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
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
