import type { Journal } from '../../../schema/journal';

export interface PaperlessngxJournal {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformJournal(raw: PaperlessngxJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.title,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
