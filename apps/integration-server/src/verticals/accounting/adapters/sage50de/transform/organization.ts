/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Organization } from '../../../schema/organization';

export interface Sage50deOrganizationAddress {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  postal_code?: string;
  region?: string;
  country?: string;
  [key: string]: unknown;
}

export interface Sage50deOrganizationCurrency {
  id?: string;
  [key: string]: unknown;
}

export interface Sage50deOrganization {
  id: string | number;
  displayed_as?: string;
  legal_name?: string;
  tax_number?: string;
  main_address?: Sage50deOrganizationAddress;
  currency?: Sage50deOrganizationCurrency;
  email?: string;
  telephone?: string;
  [key: string]: unknown;
}

export function transformOrganization(raw: Sage50deOrganization): Organization {
  return {
    name: raw.displayed_as,
    legalName: raw.legal_name,
    taxNumber: raw.tax_number,
    currency: raw.currency?.id,
    address: {
      address1: raw.main_address?.address_line_1,
      address2: raw.main_address?.address_line_2,
      city: raw.main_address?.city,
      postalCode: raw.main_address?.postal_code,
      region: raw.main_address?.region,
      country: raw.main_address?.country,
    },
    metadata: raw as Record<string, unknown>,
  };
}

export type Sage50DeOrganization = Sage50deOrganization
