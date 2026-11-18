import { toCalendarDate } from '../../shared/transform'
/**
 * eGestor Vendas (Sales) → canonical Invoice transform.
 *
 * eGestor "vendas" endpoint: GET /api/v1/vendas
 * situacao codes: 10=budget/quote, 50=sale (confirmed)
 * financeiros.situacao: 20=open/pending, 40=received/paid
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface EgestorVendaProduto {
  codigo: number
  codProduto: number
  preco: number
  quant: number
  desconto?: number
  descricao?: string
  codigoProprio?: string
  [key: string]: unknown
}

export interface EgestorVendaFinanceiro {
  codigo: number
  descricao?: string
  codCaixa?: number
  situacao?: number
  dtComp?: string
  dtVenc?: string
  dtPgto?: string
  valor?: number
  [key: string]: unknown
}

export interface EgestorVenda {
  codigo: number
  codContato?: number
  nomeContato?: string
  numNota?: string
  dtVenda?: string
  dtEntrega?: string
  dtCad?: string
  valorTotal?: number
  extFrete?: number
  extDesp?: number
  obs?: string
  tags?: string[]
  /** 10=budget/quote, 50=sale/confirmed */
  situacao?: number
  ativo?: number
  produtos?: EgestorVendaProduto[]
  financeiros?: EgestorVendaFinanceiro[]
  [key: string]: unknown
}

function mapStatus(raw: EgestorVenda): InvoiceStatus {
  if (raw.ativo === 0) return 'VOIDED'
  if (raw.situacao === 50) {
    // Check if any financeiros are open
    const fins = raw.financeiros ?? []
    if (fins.length === 0) return 'AUTHORIZED'
    const allPaid = fins.every((f) => f.situacao === 40)
    const somePaid = fins.some((f) => f.situacao === 40)
    if (allPaid) return 'PAID'
    if (somePaid) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  // situacao=10 = budget/quote
  return 'DRAFT'
}

function mapLineitem(p: EgestorVendaProduto): Lineitem {
  const qty = p.quant ?? 1
  const unit = p.preco ?? 0
  const disc = p.desconto ?? 0
  return {
    id: String(p.codigo),
    itemId: p.codProduto ? String(p.codProduto) : undefined,
    itemSku: p.codigoProprio || undefined,
    itemDescription: p.descricao || undefined,
    unitAmount: unit,
    unitQuantity: qty,
    discountAmount: disc || undefined,
    totalAmount: unit * qty - disc,
  }
}

export function transformInvoice(raw: EgestorVenda): Invoice {
  const fins = raw.financeiros ?? []
  const paidFins = fins.filter((f) => f.situacao === 40)
  const paidAmount = paidFins.reduce((s, f) => s + (f.valor ?? 0), 0)
  const totalAmount = raw.valorTotal ?? 0
  const balanceAmount = totalAmount - paidAmount

  const earliestDue = fins
    .filter((f) => f.dtVenc)
    .map((f) => f.dtVenc as string)
    .sort()[0]

  const latestPaid = paidFins
    .filter((f) => f.dtPgto)
    .map((f) => f.dtPgto as string)
    .sort()
    .reverse()[0]

  return {
    id: String(raw.codigo),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.numNota || String(raw.codigo),
    contactId: raw.codContato ? String(raw.codContato) : undefined,
    totalAmount,
    balanceAmount: balanceAmount >= 0 ? balanceAmount : 0,
    paidAmount: paidAmount || undefined,
    notes: raw.obs || undefined,
    lineItems: (raw.produtos ?? []).map(mapLineitem),
    postedAt: raw.dtVenda ? new Date(raw.dtVenda) : undefined,
    dueAt: earliestDue ? new Date(earliestDue) : undefined,
    paidAt: latestPaid ? new Date(latestPaid) : undefined,
    createdAt: raw.dtCad ? new Date(raw.dtCad) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Invoice → eGestor venda body (for create) */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    codContato: invoice.contactId ? Number(invoice.contactId) : undefined,
    numNota: invoice.invoiceNumber,
    dtVenda: toCalendarDate(invoice.postedAt),
    dtEntrega: toCalendarDate(invoice.dueAt),
    obs: invoice.notes,
    situacao: 50,
    produtos: invoice.lineItems?.map((li) => ({
      codProduto: li.itemId ? Number(li.itemId) : undefined,
      preco: li.unitAmount,
      quant: li.unitQuantity ?? 1,
      desconto: li.discountAmount,
      descricao: li.itemDescription,
    })),
  }
}
