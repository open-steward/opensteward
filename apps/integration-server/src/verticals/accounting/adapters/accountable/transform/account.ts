import type { Account, AccountStatus, AccountType } from '../../../schema/account';

export interface AccountableAccount {
  id: string | number;
  code?: string;
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

export function transformAccount(raw: AccountableAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED';

  return {
    id: String(raw.id),
    name: raw.name,
    customerDefinedCode: raw.code,
    type: toAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  };
}
