import type { Account, AccountStatus, AccountType } from '../../../schema/account';

export interface InvoiceportalAccount {
  id: string | number;
  account_number?: string;
  name?: string;
  account_type?: string;
  active?: boolean;
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

export function transformAccount(raw: InvoiceportalAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED';

  return {
    id: String(raw.id),
    name: raw.name,
    customerDefinedCode: raw.account_number,
    type: toAccountType(raw.account_type),
    status,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalAccount = InvoiceportalAccount
