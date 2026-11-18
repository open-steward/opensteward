import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ContabiliumCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ContabiliumCreditMemo> = {}): ContabiliumCreditMemo {
  return {
    id: 25,
    numero: 'NC-001',
    clienteId: 6,
    moneda: 'ARS',
    total: 5000,
    impuestos: 1050,
    saldo: 5000,
    montoPagado: 0,
    fechaEmision: '2024-01-15',
    fechaVencimiento: '2024-02-15',
    estado: 'Pendiente',
    anulado: false,
    items: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id to string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('25')
  })

  it('maps numero to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('NC-001')
  })

  it('maps clienteId to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('6')
  })

  it('maps amounts', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(1050)
    expect(result.balanceAmount).toBe(5000)
  })

  it('maps status DRAFT for pending', () => {
    expect(transformCreditMemo(makeCreditMemo({ estado: 'Pendiente', saldo: 5000, anulado: false })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ estado: 'Autorizado', saldo: 5000, anulado: false })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when saldo=0', () => {
    expect(transformCreditMemo(makeCreditMemo({ saldo: 0 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ saldo: 2500, total: 5000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when anulado', () => {
    expect(transformCreditMemo(makeCreditMemo({ anulado: true })).status).toBe('VOIDED')
  })

  it('maps dates as Date objects', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
