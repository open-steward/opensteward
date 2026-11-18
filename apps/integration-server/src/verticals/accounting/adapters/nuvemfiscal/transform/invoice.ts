import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface NuvemFiscalNotaFiscalItem {
  id_item: number
  codigo_produto: string
  descricao: string
  preco_unitario: number
  quantidade: number
  valor_total: number
  valor_imposto: number
  id_conta: number
  desconto: number
  unidade: string
  [key: string]: unknown
}

export interface NuvemFiscalNotaFiscal {
  id_nota_fiscal: number
  numero_nota: string
  id_cliente: number
  nome_cliente: string
  data_emissao: string
  data_vencimento: string
  valor_total: number
  valor_impostos: number
  saldo: number
  moeda: string
  contabilizada: boolean
  cancelada: boolean
  enviada: boolean
  itens: NuvemFiscalNotaFiscalItem[]
  referencia_externa: string
  valor_pago: number
  [key: string]: unknown
}

function mapStatus(inv: NuvemFiscalNotaFiscal): InvoiceStatus {
  if (inv.cancelada) return 'VOIDED'
  if (inv.contabilizada && inv.saldo === 0) return 'PAID'
  if (inv.contabilizada && inv.saldo > 0 && inv.saldo < inv.valor_total) return 'PARTIALLY_PAID'
  if (inv.contabilizada) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: NuvemFiscalNotaFiscalItem): Lineitem {
  return {
    id: String(row.id_item),
    accountId: row.id_conta ? String(row.id_conta) : undefined,
    itemId: row.codigo_produto || undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.preco_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto,
    discountAmount: row.desconto || undefined,
  }
}

export function transformInvoice(raw: NuvemFiscalNotaFiscal): Invoice {
  return {
    id: String(raw.id_nota_fiscal),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.numero_nota,
    contactId: raw.id_cliente ? String(raw.id_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    taxAmount: raw.valor_impostos,
    balanceAmount: raw.saldo,
    paidAmount: raw.valor_pago || undefined,
    reference: raw.referencia_externa || undefined,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    dueAt: raw.data_vencimento ? new Date(raw.data_vencimento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    id_cliente: invoice.contactId ? Number(invoice.contactId) : undefined,
    moeda: invoice.currency,
    data_emissao: toCalendarDate(invoice.postedAt),
    data_vencimento: toCalendarDate(invoice.dueAt),
    referencia_externa: invoice.reference,
    itens: invoice.lineItems?.map((li) => ({
      codigo_produto: li.itemId,
      descricao: li.itemDescription,
      preco_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      id_conta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
