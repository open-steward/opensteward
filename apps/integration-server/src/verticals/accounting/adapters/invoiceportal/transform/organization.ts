import type { Organization } from '../../../schema/organization';

export interface InvoiceportalOrganization {
  id: string | number;
  name?: string;
  legal_name?: string;
  vat_number?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  currency_code?: string;
  [key: string]: unknown;
}

export function transformOrganization(raw: InvoiceportalOrganization): Organization {
  return {
    name: raw.name,
    legalName: raw.legal_name,
    taxNumber: raw.vat_number,
    currency: raw.currency_code,
    address: {
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    },
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalOrganization = InvoiceportalOrganization
