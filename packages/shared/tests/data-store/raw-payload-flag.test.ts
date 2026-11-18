/**
 * The raw-payload flag, through the real cache layer.
 *
 * `strip-raw-payload.test.ts` covers the policy itself. This covers the wiring,
 * which is where a flag design actually fails: the payload reaches storage, the
 * HTTP response and outbound webhooks by three independent paths, and a strip
 * applied to only one of them looks completely correct from the other two.
 *
 * So every case here asserts the returned value **and** what landed in the
 * store, separately — and does it in each of the three data-store modes, since
 * passthrough never touches the store at all.
 *
 * The flag is driven through a mutable closure, the `mcp-kill-switch.test.ts`
 * pattern, so a test can flip it mid-run and prove the read is per-request
 * rather than captured at construction.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyRequest } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { cachedList, cachedGet, writeThrough } from '../../src/data-store/cached-router-helpers'

/** Flipped mid-test to prove the policy is read per request. */
let keepRaw = false
const policy = (vertical: string): boolean =>
  vertical === 'payments' || vertical === 'accounting' ? keepRaw : true

let dir: string
let handle: DbHandle
let store: ResourceStore

beforeEach(async () => {
  keepRaw = false
  dir = mkdtempSync(join(tmpdir(), 'oi-rawflag-'))
  handle = await openDb({ sqlitePath: join(dir, 'r.db') })
  store = await ResourceStore.create(handle, { rawPayloadEnabled: policy })
})

afterEach(async () => {
  await handle?.close()
  rmSync(dir, { recursive: true, force: true })
})

function request(
  mode: 'database' | 'passthrough' | 'external',
  vertical = 'payments',
): FastifyRequest {
  return {
    query: {},
    vertical,
    platform: 'stripe',
    connectionId: 'conn_1',
    cacheMode: mode,
    resourceStore: mode === 'passthrough' ? undefined : store,
    rawPayloadEnabled: policy,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
}

const charge = () => ({
  id: 'ch_1',
  amount: 1000,
  metadata: { processor: 'stripe' },
  raw: { iban: 'GB33BUKB20201555555555' },
})

describe('payments, flag off', () => {
  it.each(['database', 'external'] as const)(
    'strips raw from the response AND the stored row (%s mode)',
    async (mode) => {
      const out = await cachedList(request(mode), {
        resourceType: 'charges',
        fetch: async () => [charge()],
      })
      expect('raw' in (out[0] as object)).toBe(false)

      // The half a response-only assertion would miss entirely.
      const stored = await store.list<Record<string, unknown>>(
        'payments',
        'stripe',
        'conn_1',
        'charges',
      )
      expect('raw' in (stored[0] as object)).toBe(false)
      expect(JSON.stringify(stored)).not.toContain('GB33BUKB')
    },
  )

  it('strips it in passthrough mode, which never touches the store', async () => {
    const out = await cachedList(request('passthrough'), {
      resourceType: 'charges',
      fetch: async () => [charge()],
    })
    expect('raw' in (out[0] as object)).toBe(false)
  })

  it('strips on cachedGet too', async () => {
    const out = (await cachedGet(request('database'), {
      resourceType: 'charges',
      resourceId: 'ch_1',
      fetch: async () => charge(),
    })) as Record<string, unknown>
    expect('raw' in out).toBe(false)
  })

  it('strips on the write-through path', async () => {
    await writeThrough(request('database'), {
      resourceType: 'charges',
      resourceId: 'ch_1',
      data: charge(),
    })
    const stored = await store.get<Record<string, unknown>>(
      'payments',
      'stripe',
      'conn_1',
      'charges',
      'ch_1',
    )
    expect(stored && 'raw' in stored).toBe(false)
  })

  it('keeps curated metadata', async () => {
    const out = await cachedList(request('database'), {
      resourceType: 'charges',
      fetch: async () => [charge()],
    })
    // metadata.processor is documented dedup logic for Chargebee and Recurly.
    expect((out[0] as Record<string, unknown>).metadata).toEqual({ processor: 'stripe' })
  })
})

describe('accounting, flag off', () => {
  it('strips metadata, which is the payload there', async () => {
    const invoice = { id: 'inv_1', total: 500, metadata: { iban: 'DE89370400440532013000' } }
    const out = await cachedList(request('database', 'accounting'), {
      resourceType: 'invoices',
      fetch: async () => [invoice],
    })
    expect('metadata' in (out[0] as object)).toBe(false)

    const stored = await store.list('accounting', 'stripe', 'conn_1', 'invoices')
    expect(JSON.stringify(stored)).not.toContain('DE89370400440532013000')
  })
})

describe('the flag is read per request', () => {
  it('takes effect without rebuilding anything', async () => {
    // Passthrough, so each call is a fresh fetch and this tests the policy read
    // rather than cache semantics.
    const req = request('passthrough')
    const fetch = async () => [charge()]

    const off = await cachedList(req, { resourceType: 'charges', fetch })
    expect('raw' in (off[0] as object)).toBe(false)

    keepRaw = true
    const on = await cachedList(req, { resourceType: 'charges', fetch })
    expect((on[0] as Record<string, unknown>).raw).toEqual({
      iban: 'GB33BUKB20201555555555',
    })

    keepRaw = false
    const offAgain = await cachedList(req, { resourceType: 'charges', fetch })
    expect('raw' in (offAgain[0] as object)).toBe(false)
  })

  it('does not backfill payloads for rows already cached', async () => {
    // Worth pinning, because it is the surprising direction. Turning the flag
    // ON cannot recover what was never stored — the cached row was stripped on
    // write. An operator needs a fresh fetch (`?is_live=true`) or a cache clear
    // before the payload reappears. The setting description says so.
    const req = request('database')
    const fetch = async () => [charge()]

    await cachedList(req, { resourceType: 'charges', fetch })
    keepRaw = true
    const afterEnabling = await cachedList(req, { resourceType: 'charges', fetch })
    expect('raw' in (afterEnabling[0] as object)).toBe(false)

    const live = await cachedList(request('passthrough'), { resourceType: 'charges', fetch })
    expect((live[0] as Record<string, unknown>).raw).toBeDefined()
  })
})

describe('rows written before the flag existed', () => {
  it('are filtered on the way out, not just on the way in', async () => {
    // An operator who turns the flag off should be protected immediately,
    // rather than only for rows written afterwards.
    const permissive = await ResourceStore.create(handle, { rawPayloadEnabled: () => true })
    await permissive.upsert('payments', 'stripe', 'conn_1', 'charges', 'ch_old', charge())

    const stored = await store.get<Record<string, unknown>>(
      'payments',
      'stripe',
      'conn_1',
      'charges',
      'ch_old',
    )
    expect(stored && 'raw' in stored).toBe(false)
  })
})

describe('the floor holds with the flag ON', () => {
  it('strips card secrets an operator cannot opt into', async () => {
    keepRaw = true
    const out = await cachedList(request('database'), {
      resourceType: 'charges',
      fetch: async () => [
        { id: 'ch_2', metadata: { processor: 'x' }, raw: { cvv: '123', pan: '4111111111111111' } },
      ],
    })
    const json = JSON.stringify(out)
    expect(json).not.toContain('123')
    expect(json).not.toContain('4111111111111111')

    const stored = await store.list('payments', 'stripe', 'conn_1', 'charges')
    expect(JSON.stringify(stored)).not.toContain('4111111111111111')
  })
})

describe('unflagged verticals', () => {
  it('keep their payload with the flag off', async () => {
    const contact = { id: 'c1', metadata: { anything: 'kept' } }
    const out = await cachedList(request('database', 'crm'), {
      resourceType: 'contacts',
      fetch: async () => [contact],
    })
    expect((out[0] as Record<string, unknown>).metadata).toEqual({ anything: 'kept' })
  })
})

describe('bulk purge', () => {
  it('removes the bytes read-filtering only hides', async () => {
    // Read filtering protects the API; it does not answer "is it still on
    // disk?", which is the question a breach review or an erasure request asks.
    const permissive = await ResourceStore.create(handle, { rawPayloadEnabled: () => true })
    await permissive.upsert('payments', 'stripe', 'conn_1', 'charges', 'ch_1', charge())
    await permissive.upsert('crm', 'hubspot', 'conn_2', 'contacts', 'c_1', { id: 'c_1' })

    const removed = await store.deleteAll('payments')
    expect(removed).toBe(1)
    expect(await store.list('payments', 'stripe', 'conn_1', 'charges')).toEqual([])
    // Scoped: the other vertical is untouched.
    expect(await store.list('crm', 'hubspot', 'conn_2', 'contacts')).toHaveLength(1)

    expect(await store.deleteAll()).toBe(1)
    expect(await store.list('crm', 'hubspot', 'conn_2', 'contacts')).toEqual([])
  })
})
