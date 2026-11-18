import type { Journal } from '../../../schema/journal';
import type { JournalLineitem } from '../../../schema/shared';

export interface InvoiceportalJournalLine {
  account_id?: string | number;
  description?: string;
  debit?: number;
  credit?: number;
  [key: string]: unknown;
}

export interface InvoiceportalJournal {
  id: string | number;
  date?: string;
  description?: string;
  reference?: string;
  lines?: InvoiceportalJournalLine[];
  [key: string]: unknown;
}

export function transformJournal(raw: InvoiceportalJournal): Journal {
  const lineItems: JournalLineitem[] = (raw.lines ?? []).map((line) => ({
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    description: line.description,
    debit: line.debit,
    credit: line.credit,
    metadata: line as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    description: raw.description,
    reference: raw.reference,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalJournal = InvoiceportalJournal
