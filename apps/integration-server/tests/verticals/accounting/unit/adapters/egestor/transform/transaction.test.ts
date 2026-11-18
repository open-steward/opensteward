import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type EgestorRecebimento,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<EgestorRecebimento> = {}): EgestorRecebimento {
  return {
    codigo: 6001,
    descricao: 'Invoice payment',
    valor: 99.99,
    dtVenc: '2024-07-31',
    dtCad: '2024-07-01',
    dtComp: '2024-07-15',
    situacao: 40,
    codContato: 70,
    nomeContato: 'Acme Corp',
    numDoc: 'DOC-001',
    codDisponivel: 1001,
    ...overrides,
  }
}

describe('egestor transformTransaction (credit direction)', () => {
  it('prefixes id with rec_ for credit direction', () => {
    const result = transformTransaction(makeRaw({ codigo: 10 }), 'credit')
    expect(result.id).toBe('rec_10')
  })

  it('type=RECEIVABLE for credit direction', () => {
    const result = transformTransaction(makeRaw(), 'credit')
    expect(result.type).toBe('RECEIVABLE')
  })

  it('prefixes id with pag_ for debit direction', () => {
    const result = transformTransaction(makeRaw({ codigo: 20 }), 'debit')
    expect(result.id).toBe('pag_20')
  })

  it('type=PAYABLE for debit direction', () => {
    const result = transformTransaction(makeRaw(), 'debit')
    expect(result.type).toBe('PAYABLE')
  })

  it('valor converted to minor units (float × 100)', () => {
    const result = transformTransaction(makeRaw({ valor: 12.34 }))
    expect(result.totalAmount).toBe(1234)
  })

  it('maps codContato to contacts[0].id as string', () => {
    const result = transformTransaction(makeRaw({ codContato: 70 }))
    expect(result.contacts?.[0]?.id).toBe('70')
  })

  it('maps codDisponivel to accountId as string', () => {
    const result = transformTransaction(makeRaw({ codDisponivel: 1001 }))
    expect(result.accountId).toBe('1001')
  })

  it('maps numDoc to reference', () => {
    const result = transformTransaction(makeRaw({ numDoc: 'REF-XYZ' }))
    expect(result.reference).toBe('REF-XYZ')
  })

  it('maps dtCad to createdAt as Date', () => {
    const result = transformTransaction(makeRaw({ dtCad: '2024-07-01' }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('default direction is credit', () => {
    const result = transformTransaction(makeRaw())
    expect(result.type).toBe('RECEIVABLE')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
