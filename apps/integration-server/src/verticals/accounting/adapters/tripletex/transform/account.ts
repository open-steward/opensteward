import type { Account } from '../../../schema/account'

export interface TripletexAccount {
  id: number
  number: number
  name: string
  description: string
  isInactive: boolean
  isBankAccount: boolean
  [key: string]: unknown
}

export function transformAccount(raw: TripletexAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: String(raw.number),
    type: raw.isBankAccount ? 'ASSET' : 'OTHER',
    status: raw.isInactive ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
