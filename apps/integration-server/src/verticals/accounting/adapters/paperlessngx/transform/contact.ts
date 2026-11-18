import type { Contact } from '../../../schema/contact';

export interface PaperlessngxContact {
  id: string | number;
  name: string;
  [key: string]: unknown;
}

export function transformContact(raw: PaperlessngxContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name,
    isCustomer: false,
    isSupplier: false,
    metadata: raw as Record<string, unknown>,
  };
}

export type PaperlessCorrespondent = PaperlessngxContact
