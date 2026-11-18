/**
 * Granatum contas (bank accounts) → canonical Account.
 *
 * Granatum's `contas` endpoint returns bank/cash accounts, not a chart-of-
 * accounts. We map them as accounts with type 'ASSET' since they represent
 * bank/cash holdings.
 *
 * The `categorias` endpoint (income/expense categories) is a separate concept
 * in Granatum and is not surfaced here — it is used as a filter parameter
 * when fetching lancamentos.
 */
import type { Account, AccountStatus } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

export interface GranatumConta {
  id: number
  descricao: string
  permite_lancamento: boolean
  ativo: boolean
  saldo?: number | string
  banco_id?: number | null
  agencia?: string | null
  numero?: string | null
  [key: string]: unknown
}

export function transformAccount(raw: GranatumConta): Account {
  const status: AccountStatus = raw.ativo ? 'ACTIVE' : 'ARCHIVED'
  // Granatum returns saldo as decimal BRL. Canonical balance is integer minor units.
  const balance = raw.saldo !== undefined && raw.saldo !== null
    ? toMinorUnits(raw.saldo as string | number)
    : undefined

  return {
    id: String(raw.id),
    name: raw.descricao || undefined,
    customerDefinedCode: String(raw.id),
    type: 'ASSET',
    status,
    balance,
    metadata: raw as Record<string, unknown>,
  }
}
