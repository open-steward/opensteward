import type { Journal } from '../../../schema/journal';
import type { JournalLineitem } from '../../../schema/shared';

export interface FastbillJournalLine {
  ACCOUNT_CODE?: string;
  DEBIT?: number;
  CREDIT?: number;
  [key: string]: unknown;
}

export interface FastbillJournal {
  JOURNAL_ID: string | number;
  DATE?: string;
  DESCRIPTION?: string;
  REFERENCE?: string;
  LINES?: FastbillJournalLine[];
  [key: string]: unknown;
}

export function transformJournal(raw: FastbillJournal): Journal {
  const lineItems: JournalLineitem[] = (raw.LINES ?? []).map((line) => ({
    accountId: line.ACCOUNT_CODE,
    description: undefined,
    debit: line.DEBIT,
    credit: line.CREDIT,
    metadata: line as Record<string, unknown>,
  }));

  return {
    id: String(raw.JOURNAL_ID),
    description: raw.DESCRIPTION,
    reference: raw.REFERENCE,
    postedAt: raw.DATE ? new Date(raw.DATE) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillJournal = FastbillJournal
