import type { Contact } from '../../../schema/contact';
import type { Telephone } from '../../../schema/shared';
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform';

export interface AccountableContactAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  [key: string]: unknown;
}

export interface AccountableContact {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string;
  address?: AccountableContactAddress;
  vatId?: string;
  isClient?: boolean;
  isSupplier?: boolean;
  [key: string]: unknown;
}

export function transformContact(raw: AccountableContact): Contact {
  const emails = toWorkEmail(raw.email);
  const telephones: Telephone[] = [];
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' });

  return {
    id: String(raw.id),
    name: raw.name,
    identification: raw.vatId,
    isCustomer: raw.isClient ?? false,
    isSupplier: raw.isSupplier ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  };
}
