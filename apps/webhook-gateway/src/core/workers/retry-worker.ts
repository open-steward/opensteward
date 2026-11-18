import axios from 'axios'
import { deliveryBody, deliveryHeaders, type DeliveryStore } from '../db/delivery-store'

/**
 * RetryWorker — polls for failed deliveries and retries them with exponential backoff.
 */
export class RetryWorker {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private store: DeliveryStore,
    private intervalMs = 5000,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.process(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async process(): Promise<void> {
    const retryable = await this.store.listRetryable()
    for (const delivery of retryable) {
      try {
        const response = await axios.post(delivery.target_url, deliveryBody(delivery), {
          headers: deliveryHeaders(delivery),
          transformRequest: [(data: Buffer) => data],
          timeout: 10_000,
          validateStatus: () => true,
        })

        if (response.status >= 200 && response.status < 300) {
          await this.store.markDelivered(delivery.id, response.status)
        } else {
          await this.store.markFailed(delivery.id, response.status, `HTTP ${response.status}`)
        }
      } catch (err) {
        await this.store.markFailed(delivery.id, null, String(err))
      }
    }
  }
}
