/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account';

export interface WisomeinbueroAccount {
  id: string | number;
  accountNumber?: string;
  name?: string;
  type?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

function toAccountType(type: string | undefined): AccountType {
  switch (type) {
    case 'asset': return 'ASSET';
    case 'liability': return 'LIABILITY';
    case 'equity': return 'EQUITY';
    case 'income': return 'INCOME';
    case 'expense': return 'EXPENSE';
    default: return 'OTHER';
  }
}

export function transformAccount(raw: WisomeinbueroAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED';

  return {
    id: String(raw.id),
    name: raw.name,
    customerDefinedCode: raw.accountNumber,
    type: toAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoAccount = WisomeinbueroAccount
