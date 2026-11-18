import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { AddressSchema, MoneySchema } from './shared'

export const CustomerSchema = z.object({
  id: z.string().meta({ example: 'cus_4Qm2Xa9Lr' }),
  email: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
  firstName: z.string().optional().meta({ example: 'Jane' }),
  lastName: z.string().optional().meta({ example: 'Doe' }),
  phone: z.string().optional().meta({ example: '+14155550123' }),
  acceptsMarketing: z.boolean().optional().meta({ example: true }),
  ordersCount: z.number().int().min(0).optional().meta({ example: 1 }),
  totalSpent: MoneySchema.optional(),
  tags: z.array(z.string()).optional().meta({ example: ['accessories'] }),
  defaultAddress: AddressSchema.optional(),
  addresses: z.array(AddressSchema).optional(),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { customerPlatformId: 'gid://shopify/Customer/cus_4Qm2Xa9Lr' } }),
})
export type Customer = z.infer<typeof CustomerSchema>
