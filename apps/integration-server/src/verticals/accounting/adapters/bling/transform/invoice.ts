import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

/**
 * Bling v3 NF-e (Nota Fiscal Eletrônica) shape.
 * GET /nfe returns list; GET /nfe/:id returns single.
 *
 * situacao: 1=pending, 2=processing, 3=authorized, 4=cancelled, 5=denied,
 *           6=queued, 7=draft, 9=voided.
 * tipo: 1=outbound (sale), 0=inbound (purchase).
 * valorNota = total invoice value.
 * dataEmissao = issue date-time "YYYY-MM-DD HH:mm:ss".
 */
export interface BlingNfe {
  id: number
  numero?: string
  serie?: number | string
  situacao?: number     // 1..9
  tipo?: number         // 0 | 1
  dataEmissao?: string
  dataOperacao?: string
  valorNota?: number
  contato?: {
    id?: number
    nome?: string
    numeroDocumento?: string
    email?: string
    endereco?: {
      municipio?: string
      uf?: string
    }
  }
  itens?: BlingNfeItem[]
  chaveAcesso?: string
  linkDanfe?: string
  [key: string]: unknown
}

export interface BlingNfeItem {
  codigo?: string
  descricao?: string
  unidade?: string
  quantidade?: number
  valor?: number
  [key: string]: unknown
}

/**
 * situacao mapping for NF-e.
 * 1 = pendente, 2 = processando, 3 = autorizada, 4 = cancelada,
 * 5 = denegada, 6 = na fila, 7 = rascunho, 9 = inutilizado.
 */
function mapStatus(situacao?: number): InvoiceStatus {
  switch (situacao) {
    case 3: return 'AUTHORIZED'
    case 4: return 'VOIDED'
    case 5: return 'DELETED'
    case 7: return 'DRAFT'
    default: return 'DRAFT'
  }
}

function mapItems(items?: BlingNfeItem[]): Lineitem[] {
  if (!items?.length) return []
  return items.map((item) => ({
    itemId: item.codigo || undefined,
    itemDescription: item.descricao || undefined,
    unitAmount: item.valor != null ? Math.round(item.valor * 100) : undefined,
    unitQuantity: item.quantidade != null ? Math.round(item.quantidade) : undefined,
    totalAmount:
      item.valor != null && item.quantidade != null
        ? Math.round(item.valor * item.quantidade * 100)
        : undefined,
  }))
}

export function transformInvoice(raw: BlingNfe): Invoice {
  const totalAmount = raw.valorNota != null ? Math.round(raw.valorNota * 100) : undefined

  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.situacao),
    invoiceNumber: raw.numero || undefined,
    contactId: raw.contato?.id != null ? String(raw.contato.id) : undefined,
    notes: raw.chaveAcesso || undefined,
    url: raw.linkDanfe || undefined,
    totalAmount,
    lineItems: mapItems(raw.itens),
    postedAt: raw.dataEmissao ? new Date(raw.dataEmissao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
