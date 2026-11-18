import type { Account } from '../../../schema/account'

/**
 * Bling v3 contas contabeis (accounting chart-of-accounts) shape.
 * GET /contas-contabeis — list; GET /contas-contabeis/:id — single.
 * Bling does not expose an account type or balance in this endpoint;
 * it is essentially a flat label used to classify financial entries.
 * situacao: 1=active, 2=inactive.
 */
export interface BlingContaContabil {
  id: number
  descricao?: string   // account description / name
  situacao?: number    // 1=active, 2=inactive
  [key: string]: unknown
}

export function transformAccount(raw: BlingContaContabil): Account {
  return {
    id: String(raw.id),
    name: raw.descricao || undefined,
    status: raw.situacao === 2 ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
