/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account';

export interface Sage50deAccountType {
  id?: string;
  [key: string]: unknown;
}

export interface Sage50deAccount {
  id: string | number;
  displayed_as?: string;
  nominal_code?: string;
  account_type?: Sage50deAccountType;
  active?: boolean;
  [key: string]: unknown;
}

function toAccountType(type: string | undefined): AccountType {
  switch (type) {
    case 'ASSET': return 'ASSET';
    case 'LIABILITY': return 'LIABILITY';
    case 'EQUITY': return 'EQUITY';
    case 'INCOME': return 'INCOME';
    case 'EXPENSE': return 'EXPENSE';
    default: return 'OTHER';
  }
}

export function transformAccount(raw: Sage50deAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED';

  return {
    id: String(raw.id),
    name: raw.displayed_as,
    customerDefinedCode: raw.nominal_code,
    type: toAccountType(raw.account_type?.id),
    status,
    metadata: raw as Record<string, unknown>,
  };
}

export type Sage50DeAccountType = Sage50deAccountType
export type Sage50DeAccount = Sage50deAccount
