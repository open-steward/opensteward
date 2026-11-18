/**
 * vhsys bank account (contas bancárias) transform.
 *
 * vhsys exposes bank/financial accounts under the "contas_bancarias" resource.
 *
 * Endpoints:
 *   GET /contas_bancarias        — list accounts
 *   GET /contas_bancarias/{id}   — get account
 */
import type { Account, AccountStatus } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysContaBancaria {
  id_conta: string | number
  nome_conta?: string
  banco?: string
  agencia?: string
  conta?: string
  situacao?: string   // 'A' = active, 'I' = inactive
  saldo_inicial?: number | string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: VhsysContaBancaria): Account {
  const status: AccountStatus = raw.situacao === 'I' ? 'ARCHIVED' : 'ACTIVE'
  // Build a human-readable name: e.g. "Bradesco — ag 1234 / cc 56789-0"
  const parts: string[] = []
  if (raw.nome_conta) parts.push(String(raw.nome_conta))
  else if (raw.banco) parts.push(String(raw.banco))
  if (raw.agencia) parts.push(`ag ${raw.agencia}`)
  if (raw.conta) parts.push(`cc ${raw.conta}`)
  const name = parts.join(' — ') || undefined

  return {
    id: String(raw.id_conta),
    name,
    customerDefinedCode: String(raw.id_conta),
    status,
    balance: toMinorUnits(raw.saldo_inicial),
    metadata: raw as Record<string, unknown>,
  }
}
