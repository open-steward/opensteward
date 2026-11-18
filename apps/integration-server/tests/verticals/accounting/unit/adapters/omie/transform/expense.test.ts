import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type OmieExpense } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/expense'

function makeRaw(overrides: Partial<OmieExpense> = {}): OmieExpense {
  return {
    codigo_lancamento: 45,
    descricao: 'Despesa de viagem',
    codigo_fornecedor: 6,
    valor_total: 500,
    valor_imposto: 0,
    moeda: 'BRL',
    data_emissao: '2024-06-20',
    itens: [],
    ...overrides,
  }
}

describe('omie transformExpense', () => {
  it('maps codigo_lancamento to id as string', () => {
    expect(transformExpense(makeRaw()).id).toBe('45')
  })

  it('maps descricao to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Despesa de viagem')
  })

  it('maps codigo_fornecedor to contactId as string', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('6')
  })

  it('maps valor_total to totalAmount', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(500)
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-06-20'))
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
