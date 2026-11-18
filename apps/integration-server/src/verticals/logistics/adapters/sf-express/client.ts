import axios from 'axios'
import { SF_EXPRESS_API_BASE } from './constants'
import { sign } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * SF Express client. All requests POST to a single endpoint with serviceCode.
 * Each request is signed with HMAC-SHA256.
 */
export class SFExpressClient {
  private checkword: string
  private partnerId: string | undefined

  constructor(credentials: Credentials, partnerId?: string) {
    this.checkword = credentials.accessToken
    this.partnerId = partnerId
  }

  async request<T>(serviceCode: string, msgData: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const msgDataStr = JSON.stringify(msgData)
      const timestamp = Math.floor(Date.now() / 1000)
      const msgDigest = sign(msgDataStr, timestamp, this.checkword)

      const { data } = await axios.post(
        SF_EXPRESS_API_BASE,
        {
          partnerID: this.partnerId,
          serviceCode,
          timestamp,
          msgDigest,
          msgData: msgDataStr,
          requestID: `${Date.now()}`,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        },
      )

      if (data.apiResultCode !== 'A1000' && data.apiResultCode !== undefined) {
        throw new Error(`SF Express API error: ${data.apiResultCode} - ${data.apiErrorMsg ?? 'unknown'}`)
      }

      const result = typeof data.apiResultData === 'string'
        ? JSON.parse(data.apiResultData)
        : data.apiResultData

      return result as T
    })
  }
}
