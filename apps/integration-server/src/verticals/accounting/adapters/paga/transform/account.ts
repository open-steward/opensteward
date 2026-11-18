import type { Account } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface PagaAccount {
  accountNumber?: string
  accountName?: string
  balance?: number
  currency?: string
  [key: string]: unknown
}

export function transformAccount(raw: PagaAccount): Account {
  return {
    id: raw.accountNumber || undefined,
    name: raw.accountName || undefined,
    balance: parseDecimal(raw.balance),
    currency: raw.currency || 'NGN',
    metadata: raw as Record<string, unknown>,
  }
}
