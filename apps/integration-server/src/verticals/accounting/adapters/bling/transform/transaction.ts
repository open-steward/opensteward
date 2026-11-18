import type { Transaction } from '../../../schema/transaction'
import type { TransactionContact } from '../../../schema/transaction'

/**
 * Bling v3 contas a receber (accounts receivable) shape.
 * GET /contas/receber — list; GET /contas/receber/:id — single.
 *
 * situacao: 1=open, 2=partially-paid, 3=paid, 4=cancelled, 5=overdue.
 * vencimento / dataEmissao format: "YYYY-MM-DD".
 * valor = total value; saldo = remaining balance.
 * All monetary values in BRL decimal (e.g. 1500.75 = R$1500.75).
 *
 * Mapped as Transaction: accounts receivable records represent the canonical
 * notion of a financial transaction (money to be received / received).
 */
export interface BlingContaReceber {
  id: number
  situacao?: number    // 1=open, 2=partially-paid, 3=paid, 4=cancelled, 5=overdue
  vencimento?: string  // "YYYY-MM-DD"
  vencimentoOriginal?: string
  valor?: number
  saldo?: number
  dataEmissao?: string
  competencia?: string
  numeroDocumento?: string
  historico?: string
  idTransacao?: string
  contato?: {
    id?: number
    nome?: string
    numeroDocumento?: string
    tipo?: string
  }
  contaContabil?: { id?: number; descricao?: string }
  formaPagamento?: { id?: number }
  portador?: { id?: number }
  categoria?: { id?: number }
  vendedor?: { id?: number }
  borderos?: number[]
  [key: string]: unknown
}

function mapSituacaoToType(situacao?: number): string {
  switch (situacao) {
    case 3: return 'PAYMENT'
    case 4: return 'VOID'
    default: return 'RECEIVABLE'
  }
}

export function transformTransaction(raw: BlingContaReceber): Transaction {
  const totalAmount = raw.valor != null ? Math.round(raw.valor * 100) : undefined

  const contacts: TransactionContact[] = []
  if (raw.contato?.id != null || raw.contato?.nome) {
    contacts.push({
      id: raw.contato.id != null ? String(raw.contato.id) : undefined,
      name: raw.contato.nome || undefined,
    })
  }

  return {
    id: String(raw.id),
    accountId: raw.contaContabil?.id != null ? String(raw.contaContabil.id) : undefined,
    type: mapSituacaoToType(raw.situacao),
    reference: raw.numeroDocumento || undefined,
    memo: raw.historico || undefined,
    totalAmount,
    contacts: contacts.length ? contacts : undefined,
    createdAt: raw.dataEmissao ? new Date(raw.dataEmissao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
