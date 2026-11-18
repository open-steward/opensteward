import { z } from 'zod'
import { Email, ExternalId, IsoDatetime, Name, nullish } from '@opensteward/shared'
import { AddressSchema } from './shared'

export const ContactSchema = z
  .object({
    id: ExternalId.describe('Platform-specific contact identifier.').meta({ example: 'cont_jane' }),
    first_name: nullish(Name).describe('Given name.').meta({ example: 'Jane' }),
    last_name: nullish(Name).describe('Family name.').meta({ example: 'Doe' }),
    name: nullish(Name).describe('Full display name. Derived by the platform when not set explicitly.').meta({ example: 'Jane Doe' }),
    email: nullish(Email).describe('Primary email address.').meta({ example: 'jane.doe@acme.example' }),
    phone: nullish(z.string().max(64)).describe('Primary phone number.').meta({ example: '+14155550123' }),
    mobile: nullish(z.string().max(64)).describe('Mobile phone number, if distinct from `phone`.').meta({ example: '+14155550123' }),
    title: nullish(Name).describe('Job title.').meta({ example: 'Head of Finance' }),
    company_id: nullish(ExternalId).describe('Linked Company.id. Empty for unattached contacts.').meta({ example: 'co_acme' }),
    owner_id: nullish(ExternalId).describe('Platform user who owns the record.').meta({ example: 'usr_olivia' }),
    stage: nullish(z.string().max(64)).describe('Lifecycle stage (e.g. `lead`, `customer`). Platform-defined.').meta({ example: 'customer' }),
    tags: z.array(z.string().max(255)).optional().describe('Free-form labels.').meta({ example: ['vip', 'q1-expansion'] }),
    address: nullish(AddressSchema).describe('Primary postal address.'),
    created_at: nullish(IsoDatetime).meta({ example: '2026-01-15T09:30:00Z' }),
    updated_at: nullish(IsoDatetime).meta({ example: '2026-02-01T14:20:00Z' }),
    ecommerce_customer_id: nullish(ExternalId).describe(
      'Cross-vertical link — Ecommerce Customer.id when the same person is known there.',
    ).meta({ example: 'cus_jane' }),
    accounting_contact_id: nullish(ExternalId).describe(
      'Cross-vertical link — Accounting Contact.id when the same person is known there.',
    ).meta({ example: 'cont_jane' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response. Use this for fields not yet normalised.'),
  })
  .describe('A person known to the CRM — lead, prospect, customer, or contact.')
export type Contact = z.infer<typeof ContactSchema>
