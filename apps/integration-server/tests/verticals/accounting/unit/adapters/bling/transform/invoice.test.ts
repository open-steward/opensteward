import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type BlingNfe,
  type BlingNfeItem,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeItem(overrides: Partial<BlingNfeItem> = {}): BlingNfeItem {
  return {
    codigo: 'SKU-001',
    descricao: 'Produto A',
    valor: 50.0,
    quantidade: 3,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<BlingNfe> = {}): BlingNfe {
  return {
    id: 500,
    numero: 'NF-2024-001',
    situacao: 3,
    valorNota: 150.0,
    dataEmissao: '2024-03-15 10:30:00',
    contato: { id: 88, nome: 'Cliente SA' },
    itens: [makeItem()],
    chaveAcesso: '35240312345678000195550010000001011234567890',
    linkDanfe: 'https://bling.com.br/danfe/123',
    ...overrides,
  }
}

describe('transformInvoice (bling)', () => {
  it('maps id to string', () => {
    const result = transformInvoice(makeInvoice({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('always sets type to INVOICE', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.type).toBe('INVOICE')
  })

  it('maps situacao=3 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ situacao: 3 })).status).toBe('AUTHORIZED')
  })

  it('maps situacao=4 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ situacao: 4 })).status).toBe('VOIDED')
  })

  it('maps situacao=5 to DELETED', () => {
    expect(transformInvoice(makeInvoice({ situacao: 5 })).status).toBe('DELETED')
  })

  it('maps situacao=7 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ situacao: 7 })).status).toBe('DRAFT')
  })

  it('maps situacao=1 (pending) to DRAFT as default', () => {
    expect(transformInvoice(makeInvoice({ situacao: 1 })).status).toBe('DRAFT')
  })

  it('maps situacao=undefined to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ situacao: undefined })).status).toBe('DRAFT')
  })

  it('converts valorNota to minor units', () => {
    const result = transformInvoice(makeInvoice({ valorNota: 150.75 }))
    expect(result.totalAmount).toBe(15075)
  })

  it('maps contato.id to contactId as string', () => {
    const result = transformInvoice(makeInvoice({ contato: { id: 77, nome: 'Cliente' } }))
    expect(result.contactId).toBe('77')
  })

  it('maps chaveAcesso to notes', () => {
    const result = transformInvoice(makeInvoice({ chaveAcesso: 'CHAVE-123' }))
    expect(result.notes).toBe('CHAVE-123')
  })

  it('maps linkDanfe to url', () => {
    const result = transformInvoice(makeInvoice({ linkDanfe: 'https://example.com/danfe' }))
    expect(result.url).toBe('https://example.com/danfe')
  })

  it('maps itens to lineItems with minor unit conversion', () => {
    const result = transformInvoice(
      makeInvoice({
        itens: [makeItem({ codigo: 'SKU-1', descricao: 'Widget', valor: 10.5, quantidade: 2 })],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const item = result.lineItems![0]!
    expect(item.itemId).toBe('SKU-1')
    expect(item.itemDescription).toBe('Widget')
    expect(item.unitAmount).toBe(1050)
    expect(item.unitQuantity).toBe(2)
    expect(item.totalAmount).toBe(2100)
  })

  it('produces empty lineItems array when itens is empty', () => {
    const result = transformInvoice(makeInvoice({ itens: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('maps dataEmissao to postedAt Date', () => {
    const result = transformInvoice(makeInvoice({ dataEmissao: '2024-03-15 10:30:00' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('passes raw as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('result passes InvoiceSchema validation', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes InvoiceSchema validation', () => {
    const result = transformInvoice({ id: 1 })
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
