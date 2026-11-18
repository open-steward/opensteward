import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipBobAdapter } from '../../../../../../src/verticals/logistics/adapters/shipbob/index'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

/**
 * `refreshCredentials` built a fresh four-key object literal, so every field
 * the blob carried that the token response does not name — `extra`,
 * `webhookSecret`, `tenantId` — was absent from what it returned.
 *
 * That is not a cosmetic omission. `refreshWithRotationGuard` persists the
 * return value with `store.updateById(connectionId, fresh)`, and `updateById`
 * encrypts it and REPLACES the whole blob; nothing merges. So the first
 * refresh after connect — ShipBob access tokens live about an hour — wrote
 * those fields out of the database permanently.
 *
 * For ShipBob the field that matters is `extra.channelId`: `ShipBobClient`
 * reads it to set the `shipbob_channel_id` header, which decides which
 * channel's records the token may read or write and which `order:estimate`
 * requires outright. After one refresh the header silently stopped being
 * sent.
 *
 * `credential-templates.ts` states the contract these assert: additional
 * fields "are stored on `credentials.extra` and must be re-supplied at
 * refresh time by the adapter".
 */

const TOKEN_RESPONSE = {
  access_token: 'fresh-access',
  refresh_token: 'fresh-refresh',
  expires_in: 3600,
  scope: 'orders_read',
}

/** A connection as it stands right after connect. */
function connected(overrides: Partial<Credentials> = {}): Credentials {
  return {
    accessToken: 'stale-access',
    refreshToken: 'stale-refresh',
    extra: { channelId: '281033' },
    ...overrides,
  }
}

function stubToken() {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN_RESPONSE } as never)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shipbob refreshCredentials', () => {
  it('carries extra through the refresh', async () => {
    stubToken()
    const out = await new ShipBobAdapter().refreshCredentials(connected())
    // Without this the shipbob_channel_id header is gone for the life of the
    // connection, because the persisted blob no longer holds the id.
    expect(out.extra).toEqual({ channelId: '281033' })
  })

  it('carries webhookSecret through the refresh', async () => {
    stubToken()
    const creds = connected({ webhookSecret: 'whsec_per_connection' })
    const out = await new ShipBobAdapter().refreshCredentials(creds)
    expect(out.webhookSecret).toBe('whsec_per_connection')
  })

  it('carries tenantId through the refresh', async () => {
    stubToken()
    const creds = connected({ tenantId: 'tenant-7' })
    const out = await new ShipBobAdapter().refreshCredentials(creds)
    expect(out.tenantId).toBe('tenant-7')
  })

  it('still replaces the token fields with the ones just issued', async () => {
    stubToken()
    const out = await new ShipBobAdapter().refreshCredentials(connected())
    expect(out.accessToken).toBe('fresh-access')
    expect(out.refreshToken).toBe('fresh-refresh')
    expect(out.scope).toBe('orders_read')
    expect(out.expiresAt).toBeInstanceOf(Date)
  })

  it('keeps the old refresh token when the response omits one', async () => {
    // ShipBob does not rotate on every refresh; a response without
    // `refresh_token` must not blank the one that still works.
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { ...TOKEN_RESPONSE, refresh_token: undefined },
    } as never)
    const out = await new ShipBobAdapter().refreshCredentials(connected())
    expect(out.refreshToken).toBe('stale-refresh')
  })

  it('returns the credentials untouched when there is no refresh token', async () => {
    const post = stubToken()
    const creds = connected({ refreshToken: undefined })
    const out = await new ShipBobAdapter().refreshCredentials(creds)
    expect(post).not.toHaveBeenCalled()
    expect(out).toEqual(creds)
  })
})
