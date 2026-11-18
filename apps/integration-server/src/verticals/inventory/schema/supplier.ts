import { z } from 'zod'

/**
 * Supplier — vendor / source.
 *
 * Banking details + payment terms refused — use accounting vertical for AP.
 */
export const SupplierSchema = z.object({
  id: z.string().meta({ example: 'sup_1042' }),
  externalId: z.string().meta({ example: 'sup_1042' }),
  name: z.string().meta({ example: 'Keyboards Inc' }),
  email: z.email().optional().meta({ example: 'orders@keyboards.example' }),
  phone: z.string().optional().meta({ example: '+14155550199' }),
  defaultCurrency: z.string().optional().meta({ example: 'USD' }),
  defaultLeadTimeDays: z.number().int().min(0).optional().meta({ example: 14 }),
  isActive: z.boolean().meta({ example: true }),
  platform: z.string().meta({ example: 'cin7' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Supplier = z.infer<typeof SupplierSchema>
