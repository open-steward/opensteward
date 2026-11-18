import type { Account } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface SilaWallet {
  nickname?: string
  blockchain_address?: string
  balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: SilaWallet): Account {
  return {
    id: raw.blockchain_address || undefined,
    name: raw.nickname || undefined,
    balance: parseDecimal(raw.balance),
    currency: 'USD',
    metadata: raw as Record<string, unknown>,
  }
}
