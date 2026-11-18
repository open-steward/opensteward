import type { Account, AccountStatus } from '../../../schema/account'

export interface NuvemFiscalAccount {
  id_conta: number
  nome: string
  codigo: string
  ativa: boolean
  saldo: number
  tipo: string
  natureza: string
  [key: string]: unknown
}

export function transformAccount(raw: NuvemFiscalAccount): Account {
  const status: AccountStatus = raw.ativa ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id_conta),
    name: raw.nome || undefined,
    customerDefinedCode: String(raw.codigo),
    status,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
