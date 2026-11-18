/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization';

export interface WisomeinbueroOrganization {
  id: string | number;
  companyName?: string;
  legalName?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  currencyCode?: string;
  [key: string]: unknown;
}

export function transformOrganization(raw: WisomeinbueroOrganization): Organization {
  return {
    name: raw.companyName,
    legalName: raw.legalName,
    taxNumber: raw.taxNumber,
    currency: raw.currencyCode,
    address: {
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zipCode,
      country: raw.country,
    },
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoOrganization = WisomeinbueroOrganization
