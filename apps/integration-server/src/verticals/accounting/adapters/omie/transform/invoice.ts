import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface OmieInvoiceItem {
  codigo_item: number
  codigo_produto: string
  descricao: string
  valor_unitario: number
  quantidade: number
  valor_total: number
  valor_imposto: number
  conta_contabil: string
  valor_desconto: number
  [key: string]: unknown
}

export interface OmieInvoice {
  codigo_lancamento: number
  numero_nota: string
  codigo_cliente: number
  nome_cliente: string
  data_emissao: string
  data_vencimento: string
  valor_total: number
  valor_imposto: number
  saldo: number
  valor_pago: number
  moeda: string
  status: string
  cancelada: string
  itens: OmieInvoiceItem[]
  referencia: string
  [key: string]: unknown
}

function mapStatus(inv: OmieInvoice): InvoiceStatus {
  if (inv.cancelada === 'S') return 'VOIDED'
  if (inv.status === 'PAGO' || inv.saldo === 0) return 'PAID'
  if (inv.saldo > 0 && inv.saldo < inv.valor_total) return 'PARTIALLY_PAID'
  if (inv.status === 'AUTORIZADO') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: OmieInvoiceItem): Lineitem {
  return {
    id: String(row.codigo_item),
    accountId: row.conta_contabil || undefined,
    itemId: row.codigo_produto || undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.valor_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto,
    discountAmount: row.valor_desconto || undefined,
  }
}

export function transformInvoice(raw: OmieInvoice): Invoice {
  return {
    id: String(raw.codigo_lancamento),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.numero_nota || undefined,
    contactId: raw.codigo_cliente ? String(raw.codigo_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    taxAmount: raw.valor_imposto,
    balanceAmount: raw.saldo,
    paidAmount: raw.valor_pago || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    dueAt: raw.data_vencimento ? new Date(raw.data_vencimento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    codigo_cliente: invoice.contactId ? Number(invoice.contactId) : undefined,
    moeda: invoice.currency,
    data_emissao: toCalendarDate(invoice.postedAt),
    data_vencimento: toCalendarDate(invoice.dueAt),
    referencia: invoice.reference,
    itens: invoice.lineItems?.map((li) => ({
      codigo_produto: li.itemId,
      descricao: li.itemDescription,
      valor_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      conta_contabil: li.accountId,
    })),
  }
}
