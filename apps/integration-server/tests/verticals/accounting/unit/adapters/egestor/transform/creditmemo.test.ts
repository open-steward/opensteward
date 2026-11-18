import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type EgestorDevolucao,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeRaw(overrides: Partial<EgestorDevolucao> = {}): EgestorDevolucao {
  return {
    codigo: 3001,
    codContato: 50,
    numNota: 'DEV-001',
    dtDevolucao: '2024-05-01',
    valorTotal: 50,
    situacao: 50,
    ativo: 1,
    produtos: [],
    ...overrides,
  }
}

describe('egestor transformCreditMemo', () => {
  it('maps codigo to id as string', () => {
    const result = transformCreditMemo(makeRaw({ codigo: 444 }))
    expect(result.id).toBe('444')
  })

  it('uses numNota as creditmemoNumber', () => {
    const result = transformCreditMemo(makeRaw({ numNota: 'RET-10' }))
    expect(result.creditmemoNumber).toBe('RET-10')
  })

  it('falls back to codigo string when numNota absent', () => {
    const result = transformCreditMemo(makeRaw({ numNota: undefined }))
    expect(result.creditmemoNumber).toBe('3001')
  })

  it('maps codContato to contactId as string', () => {
    const result = transformCreditMemo(makeRaw({ codContato: 88 }))
    expect(result.contactId).toBe('88')
  })

  it('ativo=0 → VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ ativo: 0 }))
    expect(result.status).toBe('VOIDED')
  })

  it('situacao=50 → AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ situacao: 50, ativo: 1 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('situacao=10 → DRAFT', () => {
    const result = transformCreditMemo(makeRaw({ situacao: 10, ativo: 1 }))
    expect(result.status).toBe('DRAFT')
  })

  it('amounts are raw numbers', () => {
    const result = transformCreditMemo(makeRaw({ valorTotal: 29.99 }))
    expect(result.totalAmount).toBe(29.99)
  })

  it('maps dtDevolucao to postedAt as Date', () => {
    const result = transformCreditMemo(makeRaw({ dtDevolucao: '2024-06-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
