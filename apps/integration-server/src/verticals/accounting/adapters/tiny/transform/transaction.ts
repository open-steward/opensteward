/**
 * Tiny ERP v3 — Contas a Pagar / Contas a Receber (Transactions) transform.
 *
 * Endpoints:
 *   GET /contas-pagar     — accounts payable  (type = 'PAYABLE')
 *   GET /contas-pagar/:id
 *   GET /contas-receber   — accounts receivable (type = 'RECEIVABLE')
 *   GET /contas-receber/:id
 *
 * Both resources share the same core fields and map to the canonical
 * Transaction schema.
 *
 * `situacao` string enum:
 *   'aberto'    → open/unpaid
 *   'cancelada' → cancelled
 *   'pago'      → paid
 *   'parcial'   → partially paid
 *   'prevista'  → forecast
 *   'atrasadas' → overdue
 *   'emissao'   → issued
 */

import type { Transaction } from '../../../schema/transaction'
import type { TransactionContact } from '../../../schema/transaction'

// ── Raw Tiny types ─────────────────────────────────────────────────────────────

interface TinyContaContatoEndereco {
  endereco?: string | null
  municipio?: string | null
  cep?: string | null
  uf?: string | null
  [key: string]: unknown
}

interface TinyContaContato {
  id?: number | null
  nome?: string | null
  cpfCnpj?: string | null
  email?: string | null
  telefone?: string | null
  endereco?: TinyContaContatoEndereco | null
  [key: string]: unknown
}

/** Shared fields for both contas-pagar and contas-receber. */
export interface TinyConta {
  id?: number | null
  situacao?: string | null
  data?: string | null
  dataVencimento?: string | null
  dataCompetencia?: string | null
  dataLiquidacao?: string | null
  numeroDocumento?: string | null
  serieDocumento?: string | null
  ocorrencia?: string | null
  quantidadeParcelas?: number | null
  valor?: number | null
  saldo?: number | null
  valorPago?: number | null
  multa?: number | null
  juros?: number | null
  historico?: string | null
  // contas-receber only
  taxa?: number | null
  linkBoleto?: string | null
  // nested
  contato?: TinyContaContato | null
  /** contas-pagar uses 'cliente' as the nested contact alias */
  cliente?: TinyContaContato | null
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformTransaction(
  raw: TinyConta,
  type: 'PAYABLE' | 'RECEIVABLE',
): Transaction {
  const contact = raw.contato ?? raw.cliente
  const contacts: TransactionContact[] = contact
    ? [
        {
          id: contact.id != null ? String(contact.id) : undefined,
          name: contact.nome || undefined,
        },
      ]
    : []

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    type,
    reference: raw.numeroDocumento || undefined,
    memo: raw.historico || undefined,
    totalAmount: raw.valor ?? undefined,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
