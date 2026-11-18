import type { Organization } from '../../../schema/organization';

export interface PaperlessngxOrganization {
  id: string | number;
  name: string;
  [key: string]: unknown;
}

export function transformOrganization(raw: PaperlessngxOrganization): Organization {
  return {
    name: raw.name,
    metadata: raw as Record<string, unknown>,
  };
}
