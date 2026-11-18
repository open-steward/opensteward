/**
 * eGestor Recebimentos/Pagamentos → canonical Transaction transform.
 *
 * Recebimentos (accounts receivable): GET /api/v1/recebimentos
 *   situacao: 20=open, 40=received
 * Pagamentos (accounts payable): GET /api/v1/pagamentos
 *   situacao: 10=open, 30=paid
 *
 * Both share the same shape and are mapped to a unified Transaction.
 * The "direction" field disambiguates them.
 *
 * IDs are prefixed with "rec_" (recebimentos) or "pag_" (pagamentos) so
 * that getTransaction() can route to the correct endpoint without ambiguity.
 *
 * Monetary amounts (valor, taxa) arrive as BRL floats from the API and are
 * converted to integer minor units (centavos) per the canonical schema.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface EgestorRecebimento {
  codigo: number
  codPlanoContas?: number
  codFormaPgto?: number
  numDoc?: string
  descricao?: string
  valor?: number
  taxa?: number
  dtVenc?: string
  dtPgto?: string
  dtCad?: string
  dtComp?: string
  dtCred?: string
  /** 20=open, 40=received */
  situacao?: number
  codContato?: number
  nomeContato?: string
  codDisponivel?: number
  /** "vendas" | "compras" | "financeiro" | "recorrencia" */
  origem?: string
  codModulo?: number
  obs?: string
  tags?: string[]
  [key: string]: unknown
}

export type EgestorPagamento = EgestorRecebimento

/** Convert a BRL float from the eGestor API to integer centavos. Never throws. */
function toMinorUnits(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN
  return Number.isFinite(n) ? Math.round(n * 100) : undefined
}

export function transformTransaction(raw: EgestorRecebimento, direction: 'credit' | 'debit' = 'credit'): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.codContato) {
    contacts.push({ id: String(raw.codContato), name: raw.nomeContato || undefined })
  }

  // Prefix IDs so getTransaction() can route to the correct endpoint
  const idPrefix = direction === 'credit' ? 'rec_' : 'pag_'

  const createdIso = toIsoDatetime(raw.dtCad)
  const updatedIso = toIsoDatetime(raw.dtComp)

  return {
    id: `${idPrefix}${String(raw.codigo)}`,
    accountId: raw.codDisponivel ? String(raw.codDisponivel) : undefined,
    type: direction === 'credit' ? 'RECEIVABLE' : 'PAYABLE',
    reference: typeof raw.numDoc === 'string' && raw.numDoc ? raw.numDoc : undefined,
    memo: (typeof raw.descricao === 'string' && raw.descricao ? raw.descricao : undefined) ?? (typeof raw.obs === 'string' && raw.obs ? raw.obs : undefined),
    totalAmount: toMinorUnits(raw.valor),
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: createdIso ? new Date(createdIso) : undefined,
    updatedAt: updatedIso ? new Date(updatedIso) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
