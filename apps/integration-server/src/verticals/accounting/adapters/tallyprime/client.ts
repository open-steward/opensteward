import axios from 'axios'
import { withRetry } from '@opensteward/shared'

export class TallyClient {
  /** Full URL of the Tally XML server, or of the HTTPS gateway in front of it. */
  readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async request(xml: string): Promise<string> {
    return withRetry(async () => {
      const { data } = await axios.post<string>(
        this.baseUrl,
        xml,
        {
          headers: { 'Content-Type': 'text/xml' },
        },
      )
      return data
    })
  }
}
