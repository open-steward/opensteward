import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type VhsysDevolucao,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeDevolucao(overrides: Partial<VhsysDevolucao> = {}): VhsysDevolucao {
  return {
    id_devolucao: 11,
    numero_devolucao: 'DEV-001',
    id_cliente: 7,
    situacao: 'A',
    valor_total: '800.00',
    data_devolucao: '2024-05-05',
    moeda: 'BRL',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeDevolucao())
    expect(result.id).toBe('11')
    expect(result.creditmemoNumber).toBe('DEV-001')
    expect(result.contactId).toBe('7')
    expect(result.currency).toBe('BRL')
  })

  it('converts valor_total to minor units', () => {
    const result = transformCreditMemo(makeDevolucao({ valor_total: '800.00' }))
    expect(result.totalAmount).toBe(80000)
  })

  it('maps situacao A to AUTHORIZED', () => {
    const result = transformCreditMemo(makeDevolucao({ situacao: 'A' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps situacao F to PAID', () => {
    const result = transformCreditMemo(makeDevolucao({ situacao: 'F' }))
    expect(result.status).toBe('PAID')
  })

  it('maps situacao C to VOIDED', () => {
    const result = transformCreditMemo(makeDevolucao({ situacao: 'C' }))
    expect(result.status).toBe('VOIDED')
  })

  it('falls back to id_devolucao as creditmemoNumber when numero absent', () => {
    const result = transformCreditMemo(makeDevolucao({ numero_devolucao: undefined }))
    expect(result.creditmemoNumber).toBe('11')
  })

  it('defaults currency to BRL when absent', () => {
    const result = transformCreditMemo(makeDevolucao({ moeda: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('maps line items', () => {
    const raw = makeDevolucao({
      itens: [
        {
          id_item: 3,
          id_produto: 30,
          descricao_item: 'Widget',
          qtde_item: 2,
          valor_unit_item: '40.00',
          valor_total_item: '80.00',
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('3')
    expect(li.itemId).toBe('30')
    expect(li.unitAmount).toBe(4000)
    expect(li.totalAmount).toBe(8000)
  })

  it('passes raw as metadata', () => {
    const raw = makeDevolucao()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformCreditMemo(makeDevolucao())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
