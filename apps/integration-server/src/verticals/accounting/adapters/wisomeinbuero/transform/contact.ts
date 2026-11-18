/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact';
import type { Telephone } from '../../../schema/shared';
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform';

export interface WisomeinbueroContact {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  vatId?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
  isActive?: boolean;
  [key: string]: unknown;
}

export function transformContact(raw: WisomeinbueroContact): Contact {
  const emails = toWorkEmail(raw.email);
  const telephones: Telephone[] = [];
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' });

  return {
    id: String(raw.id),
    name: raw.name,
    identification: raw.vatId,
    isCustomer: raw.isCustomer ?? false,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.isActive,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zipCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoContact = WisomeinbueroContact
