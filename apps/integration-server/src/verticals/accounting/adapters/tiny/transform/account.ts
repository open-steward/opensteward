/**
 * Tiny ERP v3 — Contas (Chart of Accounts) transform.
 *
 * Endpoint: GET /v3/contas
 * Tiny groups chart-of-accounts entries by type (Receita/Despesa).
 * Each entry carries a code (codigo), name (descricao), and active flag (situacao).
 *
 * situacao: 1 = Ativo (active), 0 = Inativo (archived)
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'

// ── Raw Tiny type ──────────────────────────────────────────────────────────────

export interface TinyConta {
  id?: number | string | null
  codigo?: string | null
  descricao?: string | null
  tipo?: string | null          // 'R' = Receita (income), 'D' = Despesa (expense)
  situacao?: number | null      // 1 = Ativo, 0 = Inativo
  [key: string]: unknown
}

// ── Mappings ──────────────────────────────────────────────────────────────────

function mapStatus(situacao?: number | null): AccountStatus {
  return situacao === 1 ? 'ACTIVE' : 'ARCHIVED'
}

function mapType(tipo?: string | null): AccountType {
  switch ((tipo ?? '').toUpperCase()) {
    case 'R': return 'INCOME'
    case 'D': return 'EXPENSE'
    default:  return 'OTHER'
  }
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformAccount(raw: TinyConta): Account {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    customerDefinedCode: raw.codigo || undefined,
    name: raw.descricao || undefined,
    type: mapType(raw.tipo),
    status: mapStatus(raw.situacao),
    metadata: raw as Record<string, unknown>,
  }
}
