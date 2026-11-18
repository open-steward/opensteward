import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

/**
 * Bling v3 contas a pagar (accounts payable / bills) shape.
 * GET /contas/pagar — list; GET /contas/pagar/:id — single.
 *
 * situacao: 1=open, 2=partially-paid, 3=paid, 4=cancelled, 5=overdue.
 * vencimento / dataEmissao format: "YYYY-MM-DD".
 * valor = total bill value; saldo = remaining balance.
 * All monetary values in BRL decimal (e.g. 1500.75 = R$1500.75).
 */
export interface BlingContaPagar {
  id: number
  situacao?: number   // 1..5
  vencimento?: string
  vencimentoOriginal?: string
  valor?: number
  saldo?: number
  dataEmissao?: string
  competencia?: string
  numeroDocumento?: string
  historico?: string
  contato?: {
    id?: number
    nome?: string
  }
  portador?: { id?: number }
  categoria?: { id?: number }
  formaPagamento?: { id?: number }
  ocorrencia?: { tipo?: number }
  [key: string]: unknown
}

function mapStatus(situacao?: number): BillStatus {
  switch (situacao) {
    case 1: return 'AUTHORIZED'
    case 2: return 'PARTIALLY_PAID'
    case 3: return 'PAID'
    case 4: return 'VOIDED'
    case 5: return 'OVERDUE'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: BlingContaPagar): Bill {
  const totalAmount = raw.valor != null ? Math.round(raw.valor * 100) : undefined
  const balanceAmount = raw.saldo != null ? Math.round(raw.saldo * 100) : undefined
  const paidAmount =
    totalAmount != null && balanceAmount != null
      ? totalAmount - balanceAmount
      : undefined

  const lineItems: Lineitem[] = raw.historico
    ? [{ itemDescription: raw.historico, totalAmount }]
    : []

  return {
    id: String(raw.id),
    status: mapStatus(raw.situacao),
    billNumber: raw.numeroDocumento || undefined,
    contactId: raw.contato?.id != null ? String(raw.contato.id) : undefined,
    totalAmount,
    balanceAmount,
    paidAmount,
    notes: raw.historico || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.dataEmissao ? new Date(raw.dataEmissao) : undefined,
    dueAt: raw.vencimento ? new Date(raw.vencimento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
