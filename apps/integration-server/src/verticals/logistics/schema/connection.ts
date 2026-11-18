import { z } from 'zod'

export const ConnectionStatusSchema = z.enum(['valid', 'expiring_soon', 'expired', 'platform_error'])
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>

export const ConnectionSchema = z.object({
  id: z.string().meta({ example: 'conn_1042' }),
  platform: z.string().meta({ example: 'ups' }),
  tenantId: z.string().optional().meta({ example: 'acme-industries' }),
  status: ConnectionStatusSchema.meta({ example: 'valid' }),
  expiresAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  createdAt: z.date().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().meta({ example: '2026-02-01T14:20:00Z' }),
})

export type Connection = z.infer<typeof ConnectionSchema>

export function connectionStatus(expiresAt: Date | undefined): ConnectionStatus {
  if (!expiresAt) return 'valid'
  const now = Date.now()
  const exp = expiresAt.getTime()
  if (now >= exp) return 'expired'
  if (exp - now < 5 * 60 * 1000) return 'expiring_soon'
  return 'valid'
}
