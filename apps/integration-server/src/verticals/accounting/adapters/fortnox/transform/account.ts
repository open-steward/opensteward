import type { Account, AccountStatus } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

export interface FortnoxAccount {
  Number: number
  Description: string
  Active: boolean
  BalanceBroughtForward: number
  BalanceCarriedForward: number
  VATCode: string
  SRU: number
  CostCenter: string
  Project: string
  [key: string]: unknown
}

export function transformAccount(raw: FortnoxAccount): Account {
  const status: AccountStatus = raw.Active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.Number),
    name: raw.Description || undefined,
    customerDefinedCode: String(raw.Number),
    status,
    balance: toMinorUnits(raw.BalanceBroughtForward),
    metadata: raw as Record<string, unknown>,
  }
}
