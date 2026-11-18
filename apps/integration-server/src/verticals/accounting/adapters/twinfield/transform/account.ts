import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface TwinfieldAccount {
  code: string
  name: string
  shortName: string
  type: string
  groupCode: string
  status: string
  [key: string]: unknown
}

function mapType(acc: TwinfieldAccount): AccountType {
  const t = acc.type?.toUpperCase() ?? ''
  if (t === 'BAS') return 'ASSET'
  if (t === 'PNL') return 'EXPENSE'
  if (t === 'BAL') return 'LIABILITY'
  return 'OTHER'
}

export function transformAccount(raw: TwinfieldAccount): Account {
  const status: AccountStatus = raw.status === 'deleted' ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.code,
    name: raw.name || undefined,
    description: raw.shortName || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw),
    status,
    group: raw.groupCode || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
