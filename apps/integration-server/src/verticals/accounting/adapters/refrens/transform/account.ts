/**
 * Refrens account transform.
 *
 * Refrens does not expose a chart-of-accounts endpoint in its public API.
 * This file is present for interface completeness; the adapter does not
 * implement listAccounts / getAccount.
 */

import type { Account } from '../../../schema/account'

// Placeholder shape — no public Refrens accounts endpoint is documented.
export interface RefrensAccount {
  _id: string
  name?: string
  [key: string]: unknown
}

export function transformAccount(raw: RefrensAccount): Account {
  return {
    id: raw._id,
    name: raw.name || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
