/**
 * Which connections the keep-alive worker picks up.
 *
 * Selection is expiry-driven: a row whose access token lapses inside the lead
 * window is a candidate regardless of when it last refreshed, so a worker
 * ticking more often than the token TTL keeps tokens live (a Fortnox token
 * lives one hour — selecting purely on time-since-refresh would leave such a
 * connection `expired` for most of a once-a-day tick's interval, and the
 * Connections tab reporting it as such, even though any request would renew
 * it). Rows with no expiry use time-since-refresh instead — there is no
 * access token to maintain, only the grant to exercise.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type DbHandle } from '@opensteward/shared'
import { CredentialStore } from '../../src/auth/store'

const SECRET = 'test-store-secret-at-least-32-chars-long!!'
const MIN = 60_000
const HOUR = 60 * MIN

let handle: DbHandle
let store: CredentialStore

/** Creates a connection and returns its generated id. */
async function connect(
  label: string,
  opts: { expiresInMs: number | null; lastRefreshMsAgo?: number },
): Promise<string> {
  const id = await store.create(
    'fortnox',
    'default',
    {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: opts.expiresInMs === null ? undefined : new Date(Date.now() + opts.expiresInMs),
    } as never,
    label,
    'accounting',
  )
  if (opts.lastRefreshMsAgo !== undefined) {
    await store.updateRefreshStatus(id, 'ok', Date.now() - opts.lastRefreshMsAgo)
  }
  return id
}

const due = (over: Record<string, unknown> = {}) =>
  store.listRefreshCandidates({
    skipWindowMs: 5 * MIN,
    deadRetryMs: 7 * 24 * HOUR,
    limit: 50,
    expiringWithinMs: 30 * MIN,
    keepWarmMs: 20 * HOUR,
    ...over,
  } as never)

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await CredentialStore.create(handle, SECRET)
})

afterEach(async () => {
  await handle?.close()
})

describe('listRefreshCandidates — expiry-driven selection', () => {
  it('picks up a token lapsing inside the lead window', async () => {
    const id = await connect('soon', { expiresInMs: 10 * MIN, lastRefreshMsAgo: 30 * MIN })
    expect((await due()).map((r) => r.id)).toContain(id)
  })

  it('picks up a token that already lapsed', async () => {
    const id = await connect('lapsed', { expiresInMs: -2 * HOUR, lastRefreshMsAgo: 3 * HOUR })
    expect((await due()).map((r) => r.id)).toContain(id)
  })

  it('leaves a token with plenty of life alone', async () => {
    const id = await connect('fresh', { expiresInMs: 50 * MIN, lastRefreshMsAgo: 10 * MIN })
    expect((await due()).map((r) => r.id)).not.toContain(id)
  })

  it('will not thrash a row it just refreshed', async () => {
    // Refreshed a minute ago but somehow still near expiry — leave it be
    // rather than hammering the token endpoint every tick.
    const id = await connect('justdone', { expiresInMs: 1 * MIN, lastRefreshMsAgo: 1 * MIN })
    expect((await due()).map((r) => r.id)).not.toContain(id)
  })

  it('still exercises a grant with no access-token expiry, on the slow cadence', async () => {
    const id = await connect('noexpiry', { expiresInMs: null, lastRefreshMsAgo: 21 * HOUR })
    expect((await due()).map((r) => r.id)).toContain(id)
  })

  it('does not touch a no-expiry grant that was exercised recently', async () => {
    const id = await connect('noexpiry-recent', { expiresInMs: null, lastRefreshMsAgo: 2 * HOUR })
    expect((await due()).map((r) => r.id)).not.toContain(id)
  })

  it('keeps ignoring grants that are dead until the retry window', async () => {
    const id = await connect('dead', { expiresInMs: -1 * HOUR })
    await store.updateRefreshStatus(id, 'expired', Date.now() - HOUR)
    expect((await due()).map((r) => r.id)).not.toContain(id)
  })
})
