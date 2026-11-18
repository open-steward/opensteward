import type { Account, AccountType } from '../../../schema/account'

export interface KwaraSavingsProduct {
  id: string
  name?: string
  identifier?: string
  product_type?: string
  state?: string
  [key: string]: unknown
}

function mapType(productType?: string): AccountType | undefined {
  switch (productType) {
    case 'savings':
      return 'ASSET'
    case 'loan':
      return 'LIABILITY'
    default:
      return undefined
  }
}

export function transformAccount(raw: KwaraSavingsProduct): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.identifier || undefined,
    type: mapType(raw.product_type),
    status: raw.state === 'active' ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
