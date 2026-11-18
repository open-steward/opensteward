/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Contact } from '../../../schema/contact';
import type { Telephone } from '../../../schema/shared';
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform';

export interface Sage50deContactAddress {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  postal_code?: string;
  region?: string;
  country?: string;
  [key: string]: unknown;
}

export interface Sage50deContact {
  id: string | number;
  displayed_as?: string;
  email?: string;
  telephone?: string;
  main_address?: Sage50deContactAddress;
  tax_number?: string;
  credit_limit?: number;
  is_customer?: boolean;
  is_supplier?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

export function transformContact(raw: Sage50deContact): Contact {
  const emails = toWorkEmail(raw.email);
  const telephones: Telephone[] = [];
  if (raw.telephone) telephones.push({ telephone: raw.telephone, type: 'WORK' });

  return {
    id: String(raw.id),
    name: raw.displayed_as,
    identification: raw.tax_number,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.main_address?.address_line_1,
      address2: raw.main_address?.address_line_2,
      city: raw.main_address?.city,
      postalCode: raw.main_address?.postal_code,
      region: raw.main_address?.region,
      country: raw.main_address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  };
}

export type Sage50DeContact = Sage50deContact
