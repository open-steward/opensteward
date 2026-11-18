/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal';
import type { JournalLineitem } from '../../../schema/shared';

export interface WisomeinbueroJournalLine {
  id?: string | number;
  accountId?: string | number;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroJournal {
  id: string | number;
  date?: string;
  description?: string;
  reference?: string;
  lines?: WisomeinbueroJournalLine[];
  [key: string]: unknown;
}

export function transformJournal(raw: WisomeinbueroJournal): Journal {
  const lineItems: JournalLineitem[] = (raw.lines ?? []).map((line) => ({
    accountId: line.accountId !== undefined ? String(line.accountId) : undefined,
    description: line.description,
    debit: line.debitAmount,
    credit: line.creditAmount,
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

export type WisoJournal = WisomeinbueroJournal
