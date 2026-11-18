import { z } from 'zod'
import { ExternalId, Iso4217Currency, Name, nullish, withUnknown } from '@opensteward/shared'
import { AddressSchema, EmailSchema, TelephoneSchema, ReferenceSchema } from './shared'

export const TaxExemptionSchema = withUnknown([
  'FEDERAL_GOV',
  'REGION_GOV',
  'LOCAL_GOV',
  'TRIBAL_GOV',
  'CHARITABLE_ORG',
  'RELIGIOUS_ORG',
  'EDUCATIONAL_ORG',
  'MEDICAL_ORG',
  'RESALE',
  'FOREIGN',
  'OTHER',
])
export type TaxExemption = z.infer<typeof TaxExemptionSchema>

export const ContactPaymentMethodSchema = z.object({
  type: withUnknown(['ACH', 'CARD', 'CHECK', 'WIRE', 'PAYPAL', 'OTHER']).optional().meta({ example: 'ACH' }),
  name: Name.optional().meta({ example: 'Acme Industries operating account' }),
  externalId: nullish(ExternalId).meta({ example: 'pm_ach_001' }),
})
export type ContactPaymentMethod = z.infer<typeof ContactPaymentMethodSchema>

export const ContactSchema = z.object({
  // Top-level resource id. Optional because some adapters cannot recover a
  // stable upstream id and fall back to undefined. The shared `ExternalId`
  // helper enforces `.min(1)` so empty-string upstream values are still
  // rejected.
  id: ExternalId.optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  name: Name.optional().meta({ example: 'Jane Doe' }),
  firstName: Name.optional().meta({ example: 'Jane' }),
  lastName: Name.optional().meta({ example: 'Doe' }),
  companyName: Name.optional().meta({ example: 'Acme Industries' }),
  identification: nullish(z.string().max(256)).meta({ example: 'acme-industries' }),
  taxNumber: nullish(z.string().max(64)).meta({ example: 'US-123456789' }),
  taxExemption: TaxExemptionSchema.optional().meta({ example: 'OTHER' }),
  isCustomer: z.boolean().optional().meta({ example: true }),
  isSupplier: z.boolean().optional().meta({ example: false }),
  isActive: z.boolean().optional().meta({ example: true }),
  currency: nullish(Iso4217Currency).meta({ example: 'USD' }),
  emails: z.array(EmailSchema).optional(),
  telephones: z.array(TelephoneSchema).optional(),
  billingAddress: nullish(AddressSchema),
  shippingAddress: nullish(AddressSchema),
  paymentMethods: z.array(ContactPaymentMethodSchema).optional(),
  associatedContacts: z.array(ReferenceSchema).optional(),
  portalUrl: nullish(z.url()).meta({ example: 'https://app.acme.example/portal/cus_4Qm2Xa9Lr' }),
  createdAt: nullish(z.date()).meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: nullish(z.date()).meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Contact = z.infer<typeof ContactSchema>
