import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type EgestorCompra,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<EgestorCompra> = {}): EgestorCompra {
  return {
    codigo: 2001,
    codContato: 50,
    numNota: 'NF-001',
    dtCompra: '2024-02-01',
    valorTotal: 100,
    situacao: 50,
    ativo: 1,
    produtos: [],
    financeiros: [],
    ...overrides,
  }
}

describe('egestor transformBill', () => {
  it('maps codigo to id as string', () => {
    const result = transformBill(makeRaw({ codigo: 9999 }))
    expect(result.id).toBe('9999')
  })

  it('uses numNota as billNumber', () => {
    const result = transformBill(makeRaw({ numNota: 'NF-042' }))
    expect(result.billNumber).toBe('NF-042')
  })

  it('falls back to codigo string when numNota absent', () => {
    const result = transformBill(makeRaw({ numNota: undefined }))
    expect(result.billNumber).toBe('2001')
  })

  it('maps codContato to contactId as string', () => {
    const result = transformBill(makeRaw({ codContato: 77 }))
    expect(result.contactId).toBe('77')
  })

  it('ativo=0 → VOIDED regardless of situacao', () => {
    const result = transformBill(makeRaw({ ativo: 0, situacao: 50 }))
    expect(result.status).toBe('VOIDED')
  })

  it('situacao=50 + empty financeiros → AUTHORIZED', () => {
    const result = transformBill(makeRaw({ situacao: 50, financeiros: [] }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('situacao=50 + all paid financeiros → PAID', () => {
    const result = transformBill(
      makeRaw({
        situacao: 50,
        financeiros: [
          { codigo: 1, situacao: 30, dtVenc: '2024-03-01', dtPgto: '2024-03-01', valor: 100 },
        ],
      }),
    )
    expect(result.status).toBe('PAID')
  })

  it('situacao=50 + some paid financeiros → PARTIALLY_PAID', () => {
    const result = transformBill(
      makeRaw({
        situacao: 50,
        financeiros: [
          { codigo: 1, situacao: 30, valor: 50 },
          { codigo: 2, situacao: 10, valor: 50 },
        ],
      }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('situacao=10 → DRAFT', () => {
    const result = transformBill(makeRaw({ situacao: 10 }))
    expect(result.status).toBe('DRAFT')
  })

  it('amounts are raw numbers (not minor units)', () => {
    const result = transformBill(makeRaw({ valorTotal: 49.99 }))
    expect(result.totalAmount).toBe(49.99)
  })

  it('maps dtCompra to postedAt as Date', () => {
    const result = transformBill(makeRaw({ dtCompra: '2024-03-15' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
