import type { Organization } from '../../../schema/organization';

export interface AccountableOrganizationAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  [key: string]: unknown;
}

export interface AccountableOrganization {
  id: string | number;
  name?: string;
  legalName?: string;
  taxId?: string;
  currency?: string;
  address?: AccountableOrganizationAddress;
  [key: string]: unknown;
}

export function transformOrganization(raw: AccountableOrganization): Organization {
  return {
    name: raw.name,
    legalName: raw.legalName,
    taxNumber: raw.taxId,
    currency: raw.currency,
    address: {
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.country,
    },
    metadata: raw as Record<string, unknown>,
  };
}
