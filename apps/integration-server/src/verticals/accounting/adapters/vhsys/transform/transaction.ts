/**
 * vhsys transaction (contas a receber — recebimentos) transform.
 *
 * vhsys accounts-receivable entries ("contas_receber") represent payments
 * received from customers. This transform maps them to the canonical
 * Transaction type.
 *
 * Endpoints:
 *   GET /contas_receber        — list receivable transactions
 *   GET /contas_receber/{id}   — get receivable transaction
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionContact } from '../../../schema/transaction'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysContaReceber {
  id_conta_receber: string | number
  id_cliente?: string | number
  nome_cliente?: string
  descricao_conta?: string
  valor_conta?: number | string
  valor_recebido?: number | string
  data_vencimento?: string
  data_recebimento?: string
  data_lancamento?: string
  situacao?: string      // 'A' = open, 'R' = received/paid, 'C' = cancelled
  moeda?: string
  forma_pagamento?: string
  numero_documento?: string
  id_conta?: string | number  // bank account
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: VhsysContaReceber): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.id_cliente !== undefined) {
    contacts.push({
      id: String(raw.id_cliente),
      name: raw.nome_cliente || undefined,
    })
  }

  const createdIso = toIsoDatetime(raw.data_lancamento)
  const updatedIso = toIsoDatetime(raw.data_recebimento)

  return {
    id: String(raw.id_conta_receber),
    accountId: raw.id_conta !== undefined ? String(raw.id_conta) : undefined,
    type: 'PAYMENT',
    reference: raw.numero_documento || undefined,
    memo: raw.descricao_conta || undefined,
    paymentMethod: raw.forma_pagamento || undefined,
    currency: raw.moeda || 'BRL',
    totalAmount: toMinorUnits(raw.valor_conta),
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: createdIso ? new Date(createdIso) : undefined,
    updatedAt: updatedIso ? new Date(updatedIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
