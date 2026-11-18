import { z } from 'zod'
import { IsoDatetime, withUnknown } from '@opensteward/shared'

export const PaymentMethodTypeSchema = withUnknown([
  'card',
  'bank_account',
  'wallet',
  'bnpl',
  'a2a',
  'mandate',
  'other',
])
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>

export const PaymentMethodSchema = z.object({
  id: z.string().meta({ example: 'pm_1042' }),
  externalId: z.string().meta({ example: 'pm_1042' }),
  customerId: z.string().optional().meta({ example: 'cus_4Qm2Xa9Lr' }),
  type: PaymentMethodTypeSchema.meta({ example: 'card' }),
  brand: z.string().optional().describe('Card brand (e.g. `visa`) or wallet name (e.g. `apple_pay`).').meta({ example: 'visa' }),
  last4: z.string().optional().meta({ example: '4242' }),
  expMonth: z.number().int().min(1).max(12).optional().meta({ example: 12 }),
  expYear: z.number().int().optional().meta({ example: 2028 }),
  holderName: z.string().optional().meta({ example: 'Jane Doe' }),
  bankName: z.string().optional().meta({ example: 'Acme Bank' }),
  isDefault: z.boolean().optional().meta({ example: true }),
  fingerprint: z.string().optional().describe('Gateway de-duplication fingerprint when available.').meta({ example: 'fp_8Hk2Wd' }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>
