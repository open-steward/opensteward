import type { Contact } from '../../../schema/contact';
import type { Telephone } from '../../../schema/shared';
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform';

export interface BuchhaltungsbutzeContact {
  id: string | number;
  company_name?: string;
  email?: string;
  phone?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  tax_id?: string;
  is_customer?: boolean;
  is_supplier?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

export function transformContact(raw: BuchhaltungsbutzeContact): Contact {
  const emails = toWorkEmail(raw.email);
  const telephones: Telephone[] = [];
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' });

  return {
    id: String(raw.id),
    name: raw.company_name,
    identification: raw.tax_id,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_supplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeContact = BuchhaltungsbutzeContact
