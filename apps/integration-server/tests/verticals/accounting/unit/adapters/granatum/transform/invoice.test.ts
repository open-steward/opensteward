import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type GranatumLancamento,
} from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<GranatumLancamento> = {}): GranatumLancamento {
  return {
    id: 301,
    descricao: 'Venda de serviços',
    valor: 1500.0,
    data_vencimento: '2099-07-31',
    data_pagamento: null,
    data_competencia: '2024-07-01',
    documento: 'NF-2024-001',
    pessoa_id: 55,
    conta_id: 5,
    categoria_id: 20,
    centro_custo_lucro_id: null,
    forma_pagamento_id: 2,
    observacao: 'Consulting services',
    modified: '2024-07-01T10:00:00',
    ...overrides,
  }
}

describe('transformInvoice (granatum)', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('301')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps documento to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('NF-2024-001')
  })

  it('maps pessoa_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('55')
  })

  it('converts decimal BRL valor to minor units', () => {
    // 1500.00 → 150000 centavos
    expect(transformInvoice(makeInvoice({ valor: 1500.0 })).totalAmount).toBe(150000)
  })

  it('takes absolute value of negative valor', () => {
    expect(transformInvoice(makeInvoice({ valor: -1500.0 })).totalAmount).toBe(150000)
  })

  it('maps data_pagamento set → PAID', () => {
    const result = transformInvoice(makeInvoice({ data_pagamento: '2024-07-20' }))
    expect(result.status).toBe('PAID')
  })

  it('maps future data_vencimento with no payment → AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice()).status).toBe('AUTHORIZED')
  })

  it('maps past data_vencimento → OVERDUE', () => {
    const result = transformInvoice(
      makeInvoice({ data_vencimento: '2000-01-01', data_pagamento: null }),
    )
    expect(result.status).toBe('OVERDUE')
  })

  it('maps data_competencia to postedAt', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps data_vencimento to dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2099-07-31'))
  })

  it('maps data_pagamento to paidAt', () => {
    const result = transformInvoice(makeInvoice({ data_pagamento: '2024-07-20' }))
    expect(result.paidAt).toEqual(new Date('2024-07-20'))
  })

  it('maps observacao to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Consulting services')
  })

  it('maps modified to updatedAt', () => {
    expect(transformInvoice(makeInvoice()).updatedAt).toEqual(new Date('2024-07-01T10:00:00'))
  })

  it('produces a schema-valid Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('converts minor units back to decimal BRL string', () => {
      const body = untransformInvoice({ totalAmount: 150000, invoiceNumber: 'NF-2024-001' })
      expect(body['valor']).toBe('1500.00')
    })

    it('converts dueAt to YYYY-MM-DD string', () => {
      const body = untransformInvoice({ dueAt: new Date('2024-07-31') })
      expect(body['data_vencimento']).toBe('2024-07-31')
    })

    it('maps invoiceNumber to documento', () => {
      const body = untransformInvoice({ invoiceNumber: 'NF-001', notes: undefined })
      expect(body['documento']).toBe('NF-001')
    })
  })
})
