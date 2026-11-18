import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '@opensteward/shared'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
import axios from 'axios'
import { DeliveryStore } from '../../src/core/db/delivery-store'
import { RetryWorker } from '../../src/core/workers/retry-worker'

let dir: string
let store: DeliveryStore

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wg-retry-'))
  store = await DeliveryStore.create(await openDb({ sqlitePath: join(dir, 'd.db') }))
  vi.mocked(axios.post).mockReset().mockResolvedValue({ status: 200 })
})
afterEach(async () => {
  await store.close()
  rmSync(dir, { recursive: true, force: true })
})

async function makeDue(id: string) {
  await store.markFailed(id, 500, 'HTTP 500')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 60_000)
}

describe('RetryWorker', () => {
  afterEach(() => vi.useRealTimers())

  it('replays the original bytes and signature headers', async () => {
    const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]) // not valid UTF-8
    const headers = {
      'content-type': 'application/octet-stream',
      'webhook-id': 'm1',
      'webhook-signature': 'v1,x',
    }
    const id = await store.createDelivery(
      'acme',
      'logistics',
      'http://up/webhooks/logistics/acme',
      bytes,
      headers,
    )
    await makeDue(id)
    await new RetryWorker(store).process()
    const [url, body, opts] = vi.mocked(axios.post).mock.calls[0]!
    expect(url).toBe('http://up/webhooks/logistics/acme')
    expect(Buffer.isBuffer(body) && body.equals(bytes)).toBe(true)
    expect((opts as { headers: Record<string, string> }).headers).toEqual(headers)
  })

  it('still retries a row written before headers were stored', async () => {
    const id = await store.createDelivery(
      'acme',
      'logistics',
      'http://up/w',
      Buffer.from('{"a":1}'),
      {},
    )
    await store.clearRelayColumnsForTest(id) // simulate a pre-v2 row
    await makeDue(id)
    await new RetryWorker(store).process()
    const [, body, opts] = vi.mocked(axios.post).mock.calls[0]!
    expect((body as Buffer).toString('utf8')).toBe('{"a":1}')
    expect((opts as { headers: Record<string, string> }).headers).toEqual({
      'content-type': 'application/json',
    })
  })
})
