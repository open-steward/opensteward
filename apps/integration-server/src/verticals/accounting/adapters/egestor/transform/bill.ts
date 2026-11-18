/**
 * eGestor Compras (Purchases) → canonical Bill transform.
 *
 * eGestor "compras" endpoint: GET /api/v1/compras
 * situacao codes: 10=budget/orçamento, 50=purchase confirmed
 * financeiros.situacao: 10=open/pending, 30=paid
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface EgestorCompraProduto {
  codigo: number
  codProduto: number
  custoBruto?: number
  quant?: number
  vDesc?: number
  valorIPI?: number
  valorST?: number
  descricao?: string
  codigoProprio?: string
  [key: string]: unknown
}

export interface EgestorCompraFinanceiro {
  codigo: number
  descricao?: string
  codCaixa?: number
  codBoleto?: number
  codRecibo?: number
  /** 10=open, 30=paid */
  situacao?: number
  dtComp?: string
  dtVenc?: string
  dtPgto?: string
  valor?: number
  [key: string]: unknown
}

export interface EgestorCompra {
  codigo: number
  codContato?: number
  nomeContato?: string
  codCompraXML?: number
  numNota?: string
  dtCompra?: string
  dtEntrega?: string
  dtCad?: string
  valorTotal?: number
  extFrete?: number
  extST?: number
  extDesp?: number
  obs?: string
  tags?: string[]
  /** 10=budget/orçamento, 50=purchase confirmed */
  situacao?: number
  ativo?: number
  produtos?: EgestorCompraProduto[]
  financeiros?: EgestorCompraFinanceiro[]
  [key: string]: unknown
}

function mapStatus(raw: EgestorCompra): BillStatus {
  if (raw.ativo === 0) return 'VOIDED'
  if (raw.situacao === 50) {
    const fins = raw.financeiros ?? []
    if (fins.length === 0) return 'AUTHORIZED'
    const allPaid = fins.every((f) => f.situacao === 30)
    const somePaid = fins.some((f) => f.situacao === 30)
    if (allPaid) return 'PAID'
    if (somePaid) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapLineitem(p: EgestorCompraProduto): Lineitem {
  const qty = p.quant ?? 1
  const unit = p.custoBruto ?? 0
  const disc = p.vDesc ?? 0
  return {
    id: String(p.codigo),
    itemId: p.codProduto ? String(p.codProduto) : undefined,
    itemSku: p.codigoProprio || undefined,
    itemDescription: p.descricao || undefined,
    unitAmount: unit,
    unitQuantity: qty,
    discountAmount: disc || undefined,
    taxAmount: (p.valorIPI ?? 0) + (p.valorST ?? 0) || undefined,
    totalAmount: unit * qty - disc,
  }
}

export function transformBill(raw: EgestorCompra): Bill {
  const fins = raw.financeiros ?? []
  const paidFins = fins.filter((f) => f.situacao === 30)
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
    status: mapStatus(raw),
    billNumber: raw.numNota || String(raw.codigo),
    contactId: raw.codContato ? String(raw.codContato) : undefined,
    totalAmount,
    balanceAmount: balanceAmount >= 0 ? balanceAmount : 0,
    paidAmount: paidAmount || undefined,
    notes: raw.obs || undefined,
    lineItems: (raw.produtos ?? []).map(mapLineitem),
    postedAt: raw.dtCompra ? new Date(raw.dtCompra) : undefined,
    dueAt: earliestDue ? new Date(earliestDue) : undefined,
    paidAt: latestPaid ? new Date(latestPaid) : undefined,
    createdAt: raw.dtCad ? new Date(raw.dtCad) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
