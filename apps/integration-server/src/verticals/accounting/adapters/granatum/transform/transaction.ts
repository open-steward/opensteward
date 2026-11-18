/**
 * Granatum lançamento → canonical Transaction.
 *
 * Every lançamento (settled or pending) can be surfaced as a transaction.
 * Positive `valor` = income; negative `valor` = expense.
 */
import type { Transaction } from '../../../schema/transaction'
import { parseDecimal, toMinorUnits } from '../../shared/transform'
import type { GranatumLancamento } from './invoice'

export function transformTransaction(raw: GranatumLancamento): Transaction {
  // Granatum returns amounts as decimal BRL (e.g. 150.00).
  // Canonical Amount is integer minor units (centavos): multiply × 100.
  const amount = parseDecimal(raw.valor)
  const minorAmount = amount !== undefined ? toMinorUnits(amount) : undefined
  const absMinorAmount = minorAmount !== undefined ? Math.abs(minorAmount) : undefined

  return {
    id: String(raw.id),
    accountId: raw.conta_id ? String(raw.conta_id) : undefined,
    type: (amount ?? 0) >= 0 ? 'INCOME' : 'EXPENSE',
    reference: raw.documento || undefined,
    memo: raw.descricao || undefined,
    totalAmount: absMinorAmount,
    contacts: raw.pessoa_id
      ? [{ id: String(raw.pessoa_id) }]
      : undefined,
    createdAt: raw.data_competencia ? new Date(raw.data_competencia) : undefined,
    updatedAt: raw.modified ? new Date(raw.modified) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
