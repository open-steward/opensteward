import type { Account, AccountStatus } from '../../../schema/account'

export interface OmieAccount {
  codigo: number
  descricao: string
  codigo_reduzido: string
  ativo: string
  saldo: number
  tipo: string
  [key: string]: unknown
}

export function transformAccount(raw: OmieAccount): Account {
  const status: AccountStatus = raw.ativo === 'S' ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.codigo),
    name: raw.descricao || undefined,
    customerDefinedCode: raw.codigo_reduzido || String(raw.codigo),
    status,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
