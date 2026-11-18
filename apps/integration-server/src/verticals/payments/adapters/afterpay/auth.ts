import type { Credentials } from '@opensteward/shared'
import { DEFAULT_REGION, type AfterpayRegion } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: Buffer.from(`${fields.merchantId ?? ''}:${fields.secretKey ?? ''}`).toString('base64'),
    extra: { region: (fields.region as AfterpayRegion) ?? DEFAULT_REGION },
  }
}
