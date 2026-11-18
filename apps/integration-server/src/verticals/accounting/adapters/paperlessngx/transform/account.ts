import type { Account, AccountStatus } from '../../../schema/account';

export interface PaperlessngxAccount {
  id: string | number;
  name?: string;
  title?: string;
  [key: string]: unknown;
}

export function transformAccount(raw: PaperlessngxAccount): Account {
  const status: AccountStatus = 'ACTIVE';

  return {
    id: String(raw.id),
    name: raw.title ?? raw.name,
    status,
    metadata: raw as Record<string, unknown>,
  };
}

export type PaperlessDocument = PaperlessngxAccount
