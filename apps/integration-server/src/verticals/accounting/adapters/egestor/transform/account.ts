/**
 * eGestor Plano de Contas (Chart of Accounts) → canonical Account transform.
 *
 * eGestor "planoContas" endpoint: GET /api/v1/planoContas
 * tipo: 1=receita (income/revenue), 2=despesa (expense)
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface EgestorPlanoContas {
  codigo: number
  codPai?: number
  nome?: string
  /** 1=receita (income), 2=despesa (expense) */
  tipo?: number
  debitar?: number
  creditar?: number
  registroPadrao?: boolean
  [key: string]: unknown
}

function mapAccountType(tipo?: number): AccountType | undefined {
  if (tipo === 1) return 'INCOME'
  if (tipo === 2) return 'EXPENSE'
  return undefined
}

export function transformAccount(raw: EgestorPlanoContas): Account {
  const status: AccountStatus = 'ACTIVE'
  return {
    id: String(raw.codigo),
    name: raw.nome || undefined,
    customerDefinedCode: String(raw.codigo),
    type: mapAccountType(raw.tipo),
    status,
    parentId: raw.codPai ? String(raw.codPai) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
