import type { Account } from '../../../schema/account'

// Kora does not expose a chart-of-accounts endpoint.
export interface KoraStubAccount {
  [key: string]: unknown
}

export function transformAccount(raw: KoraStubAccount): Account {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
