import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type NuvemFiscalDespesa } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/expense'

function makeRaw(overrides: Partial<NuvemFiscalDespesa> = {}): NuvemFiscalDespesa {
  return {
    id_despesa: 15,
    descricao: 'Compra de material',
    id_fornecedor: 8,
    valor_total: 300,
    valor_impostos: 30,
    moeda: 'BRL',
    data_emissao: '2024-05-10',
    itens: [],
    ...overrides,
  }
}

describe('nuvemfiscal transformExpense', () => {
  it('maps id_despesa to id as string', () => {
    expect(transformExpense(makeRaw()).id).toBe('15')
  })

  it('maps descricao to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Compra de material')
  })

  it('maps id_fornecedor to contactId as string', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('8')
  })

  it('maps valor_total to totalAmount', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(300)
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-05-10'))
  })

  it('maps itens to lineItems', () => {
    const raw = makeRaw({
      itens: [{ id_item: 1, id_conta: 2, descricao: 'Item', valor_total: 150, valor_imposto: 15 }],
    })
    expect(transformExpense(raw).lineItems).toHaveLength(1)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
