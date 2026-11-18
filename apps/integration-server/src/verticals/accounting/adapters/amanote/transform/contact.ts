import type { Contact } from '../../../schema/contact';
import type { Telephone } from '../../../schema/shared';
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform';

export interface AmanoteContact {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  vat_number?: string;
  is_customer?: boolean;
  is_supplier?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

export function transformContact(raw: AmanoteContact): Contact {
  const emails = toWorkEmail(raw.email);
  const telephones: Telephone[] = [];
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' });

  return {
    id: String(raw.id),
    name: raw.name,
    identification: raw.vat_number,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  };
}
