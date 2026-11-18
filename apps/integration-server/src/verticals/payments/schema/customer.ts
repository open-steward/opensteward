import { z } from 'zod'
import {
  Description,
  Email,
  ExternalId,
  Iso4217Currency,
  IsoDatetime,
  Name,
  nullish,
} from '@opensteward/shared'
import { AddressSchema } from './shared'

export const CustomerSchema = z.object({
  id: ExternalId.meta({ example: 'cus_4Qm2Xa9Lr' }),
  externalId: ExternalId.describe('Gateway-assigned identifier (e.g. Stripe `cus_…`).').meta({ example: 'cus_4Qm2Xa9Lr' }),
  email: nullish(Email).meta({ example: 'jane.doe@acme.example' }),
  name: nullish(Name).meta({ example: 'Jane Doe' }),
  phone: nullish(z.string().max(64)).meta({ example: '+14155550123' }),
  defaultPaymentMethodId: nullish(ExternalId).meta({ example: 'pm_1042' }),
  billingAddress: nullish(AddressSchema),
  shippingAddress: nullish(AddressSchema),
  currency: nullish(Iso4217Currency).describe('Default settlement currency for this customer.').meta({ example: 'USD' }),
  /** Account balance in minor units; negative = credit owed to customer. */
  balance: z.number().int().optional().meta({ example: 0 }),
  delinquent: z.boolean().optional().meta({ example: false }),
  description: nullish(Description).meta({ example: 'Invoice INV-1042' }),
  gateway: z.string().max(64).describe('Adapter slug, e.g. `stripe`.').meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: nullish(IsoDatetime).meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: nullish(IsoDatetime).meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Customer = z.infer<typeof CustomerSchema>
