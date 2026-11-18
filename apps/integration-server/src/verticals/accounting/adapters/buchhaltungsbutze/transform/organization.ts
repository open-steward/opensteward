import type { Organization } from '../../../schema/organization';

export interface BuchhaltungsbutzeOrganization {
  id: string | number;
  company_name?: string;
  tax_number?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  currency?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export function transformOrganization(raw: BuchhaltungsbutzeOrganization): Organization {
  return {
    name: raw.company_name,
    legalName: raw.company_name,
    taxNumber: raw.tax_number,
    currency: raw.currency,
    address: {
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    },
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeOrganization = BuchhaltungsbutzeOrganization
