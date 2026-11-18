/**
 * What an identity provider may write onto a console user, and when.
 *
 *   email   — a manual (admin-set) address always wins; an IdP address is
 *             stored as `idp` and refreshed; `email_verified: false` and
 *             junk are ignored.
 *   picture — an upload always wins; an IdP picture is fetched only when the
 *             URL changed; a failed fetch changes nothing and throws nothing.
 *
 * Plus the claim mapping that feeds it: OIDC claims and SAML attributes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { Profile } from '@node-saml/node-saml'
import { AdminStore } from '../../src/core/db/admin-store'
import { UserAvatarStore, hashAvatarSourceUrl } from '../../src/core/db/user-avatar-store'
import {
  AvatarFetchSlots,
  IdpProfileSync,
  SHARED_AVATAR_FETCH_SLOTS,
  type AvatarFetcher,
} from '../../src/core/auth/idp/profile-sync'
import { AvatarFetchError } from '../../src/core/auth/idp/avatar-fetch'
import { identityFromOidcClaims } from '../../src/core/auth/idp/oidc-provider'
import { identityFromSamlProfile } from '../../src/core/auth/idp/saml-provider'
import { JPEG, PNG_1X1 } from './avatar-fixtures'

let admin: AdminStore
let avatars: UserAvatarStore
let userId: string

beforeEach(async () => {
  admin = await AdminStore.create(await openDb({ sqlitePath: ':memory:' }))
  avatars = UserAvatarStore.for(admin)
  userId = (await admin.createUser('olivia', 'hash', 'viewer', { scopeSource: 'idp' })).id
})

afterEach(async () => {
  await admin.close()
})

const fetchOk = (bytes = PNG_1X1): AvatarFetcher & ReturnType<typeof vi.fn> =>
  vi.fn(async () => ({ bytes, contentType: 'image/png' as const })) as never

function logger() {
  return { info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}

/** A fetch that stays in flight until released. */
function hangingFetch() {
  const releases: Array<() => void> = []
  const fetchAvatar = vi.fn(
    () =>
      new Promise<{ bytes: Buffer; contentType: 'image/png' }>((resolve) => {
        releases.push(() => resolve({ bytes: PNG_1X1, contentType: 'image/png' }))
      }),
  )
  return { fetchAvatar, releaseAll: () => releases.splice(0).forEach((r) => r()) }
}

describe('email from the IdP', () => {
  it('fills an empty email and marks it idp-owned', async () => {
    const sync = new IdpProfileSync(admin)
    expect(await sync.syncEmail(userId, { email: ' olivia@idp.example ' })).toBe('set')
    const u = await admin.getUserById(userId)
    expect(u?.email).toBe('olivia@idp.example')
    expect(u?.email_source).toBe('idp')
  })

  it('refreshes an idp-owned email when the IdP’s address changes', async () => {
    const sync = new IdpProfileSync(admin)
    await sync.syncEmail(userId, { email: 'old@idp.example' })
    expect(await sync.syncEmail(userId, { email: 'old@idp.example' })).toBe('unchanged')
    expect(await sync.syncEmail(userId, { email: 'new@idp.example' })).toBe('set')
    expect((await admin.getUserById(userId))?.email).toBe('new@idp.example')
  })

  it('never overwrites an address an admin set', async () => {
    await admin.setUserEmail(userId, 'chosen@console.example', 'manual')
    const sync = new IdpProfileSync(admin)
    expect(await sync.syncEmail(userId, { email: 'olivia@idp.example', emailVerified: true })).toBe('kept_manual')
    const u = await admin.getUserById(userId)
    expect(u?.email).toBe('chosen@console.example')
    expect(u?.email_source).toBe('manual')
  })

  it('ignores an address the IdP marks unverified, and junk', async () => {
    const sync = new IdpProfileSync(admin)
    expect(await sync.syncEmail(userId, { email: 'olivia@idp.example', emailVerified: false })).toBe('ignored')
    expect(await sync.syncEmail(userId, { email: 'not-an-address' })).toBe('ignored')
    expect(await sync.syncEmail(userId, { email: null })).toBe('ignored')
    expect((await admin.getUserById(userId))?.email ?? null).toBeNull()
  })

  it('an unverified address does not replace a verified one already stored', async () => {
    const sync = new IdpProfileSync(admin)
    await sync.syncEmail(userId, { email: 'verified@idp.example', emailVerified: true })
    await sync.syncEmail(userId, { email: 'unverified@idp.example', emailVerified: false })
    expect((await admin.getUserById(userId))?.email).toBe('verified@idp.example')
  })

  it('a manual email an admin sets after the sync read it survives the sync', async () => {
    const sync = new IdpProfileSync(admin)
    const read = admin.getUserById.bind(admin)
    // The admin's PATCH lands between the sync's read and its write.
    vi.spyOn(admin, 'getUserById').mockImplementationOnce(async (id) => {
      const stale = await read(id)
      await admin.setUserEmail(id, 'chosen@console.example', 'manual')
      return stale
    })
    await sync.syncEmail(userId, { email: 'idp@idp.example' })
    const u = await read(userId)
    expect(u?.email).toBe('chosen@console.example')
    expect(u?.email_source).toBe('manual')
  })

  it('a manual email set after a clear read it survives the clear', async () => {
    const sync = new IdpProfileSync(admin)
    await sync.syncEmail(userId, { email: 'idp@idp.example' })
    const read = admin.getUserById.bind(admin)
    vi.spyOn(admin, 'getUserById').mockImplementationOnce(async (id) => {
      const stale = await read(id)
      await admin.setUserEmail(id, 'chosen@console.example', 'manual')
      return stale
    })
    await sync.clearIdpEmail(userId)
    const u = await read(userId)
    expect(u?.email).toBe('chosen@console.example')
    expect(u?.email_source).toBe('manual')
  })

  it('clears only an idp-owned email', async () => {
    const sync = new IdpProfileSync(admin)
    await sync.syncEmail(userId, { email: 'a@idp.example' })
    await sync.clearIdpEmail(userId)
    expect((await admin.getUserById(userId))?.email ?? null).toBeNull()
    await admin.setUserEmail(userId, 'm@console.example', 'manual')
    await sync.clearIdpEmail(userId)
    expect((await admin.getUserById(userId))?.email).toBe('m@console.example')
  })
})

describe('picture from the IdP', () => {
  const URL_A = 'https://pics.example/a.png?sig=SECRET-SIGNATURE'
  const URL_B = 'https://pics.example/b.png'

  it('fetches in the background and stores it as idp with the URL hash', async () => {
    const fetchAvatar = fetchOk()
    const sync = new IdpProfileSync(admin, { fetchAvatar })
    await sync.apply(userId, { pictureUrl: URL_A })
    await sync.idle()
    const head = await avatars.head(userId)
    expect(head?.source).toBe('idp')
    expect(head?.sourceUrlHash).toBe(hashAvatarSourceUrl(URL_A))
    expect(fetchAvatar).toHaveBeenCalledWith(URL_A)
  })

  it('does not refetch an unchanged URL, and refetches a changed one', async () => {
    const fetchAvatar = fetchOk()
    const sync = new IdpProfileSync(admin, { fetchAvatar })
    await sync.apply(userId, { pictureUrl: URL_A })
    await sync.idle()
    await sync.apply(userId, { pictureUrl: URL_A })
    await sync.idle()
    expect(fetchAvatar).toHaveBeenCalledTimes(1)

    fetchAvatar.mockResolvedValueOnce({ bytes: JPEG, contentType: 'image/jpeg' })
    await sync.apply(userId, { pictureUrl: URL_B })
    await sync.idle()
    expect(fetchAvatar).toHaveBeenCalledTimes(2)
    expect((await avatars.head(userId))?.contentType).toBe('image/jpeg')
  })

  it('shares one fetch between concurrent sign-ins', async () => {
    let release!: () => void
    const fetchAvatar = vi.fn(
      () =>
        new Promise<{ bytes: Buffer; contentType: 'image/png' }>((resolve) => {
          release = () => resolve({ bytes: PNG_1X1, contentType: 'image/png' })
        }),
    )
    const sync = new IdpProfileSync(admin, { fetchAvatar })
    await sync.apply(userId, { pictureUrl: URL_A })
    await sync.apply(userId, { pictureUrl: URL_A })
    expect(fetchAvatar).toHaveBeenCalledTimes(1)
    release()
    await sync.idle()
  })

  it('never replaces an uploaded picture', async () => {
    await avatars.put({ userId, contentType: 'image/jpeg', bytes: JPEG, source: 'upload', updatedBy: userId })
    const fetchAvatar = fetchOk()
    const sync = new IdpProfileSync(admin, { fetchAvatar })
    await sync.apply(userId, { pictureUrl: URL_A })
    await sync.idle()
    expect(fetchAvatar).not.toHaveBeenCalled()
    expect((await avatars.head(userId))?.source).toBe('upload')
  })

  it('discards a fetched picture when an upload lands while the fetch is in flight', async () => {
    let release!: () => void
    const fetchAvatar = vi.fn(
      () =>
        new Promise<{ bytes: Buffer; contentType: 'image/png' }>((resolve) => {
          release = () => resolve({ bytes: PNG_1X1, contentType: 'image/png' })
        }),
    )
    const log = logger()
    const sync = new IdpProfileSync(admin, { fetchAvatar, logger: log })
    await sync.apply(userId, { pictureUrl: URL_A })
    await avatars.put({ userId, contentType: 'image/jpeg', bytes: JPEG, source: 'upload', updatedBy: userId })
    release()
    await sync.idle()
    const head = await avatars.head(userId)
    expect(head?.source).toBe('upload')
    expect(head?.contentType).toBe('image/jpeg')
  })

  it('a failed fetch keeps the old picture, never throws, and logs the host without the URL', async () => {
    await avatars.putFromIdp({ userId, contentType: 'image/jpeg', bytes: JPEG, sourceUrlHash: hashAvatarSourceUrl(URL_B) })
    const log = logger()
    const fetchAvatar = vi.fn(async () => {
      throw new AvatarFetchError('blocked_address', 'host resolves to a non-public address')
    })
    const sync = new IdpProfileSync(admin, { fetchAvatar, logger: log })
    await expect(sync.apply(userId, { pictureUrl: URL_A })).resolves.toBeUndefined()
    await sync.idle()
    expect((await avatars.head(userId))?.contentType).toBe('image/jpeg')
    expect(log.info).toHaveBeenCalledWith(
      { userId, host: 'pics.example', reason: 'blocked_address' },
      'idp avatar not fetched',
    )
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('SECRET-SIGNATURE')
  })

  it('an absent picture changes nothing; only an explicit removal drops an idp picture', async () => {
    const sync = new IdpProfileSync(admin, { fetchAvatar: fetchOk() })
    await sync.apply(userId, { pictureUrl: URL_A })
    await sync.idle()
    await sync.apply(userId, { pictureUrl: null })
    await sync.idle()
    expect(await avatars.head(userId)).not.toBeNull()
    await sync.removeIdpAvatar(userId)
    expect(await avatars.head(userId)).toBeNull()
  })

  it('does not store a picture for a user deleted while it was being fetched', async () => {
    let release!: () => void
    const fetchAvatar = vi.fn(
      () =>
        new Promise<{ bytes: Buffer; contentType: 'image/png' }>((resolve) => {
          release = () => resolve({ bytes: PNG_1X1, contentType: 'image/png' })
        }),
    )
    const sync = new IdpProfileSync(admin, { fetchAvatar })
    await sync.apply(userId, { pictureUrl: URL_A })
    await admin.deleteUser(userId)
    release()
    await sync.idle()
    expect(await avatars.head(userId)).toBeNull()
  })
})

describe('process-wide fetch cap', () => {
  it('drops the fifth concurrent fetch and logs it at debug; a later sign-in retries', async () => {
    const { fetchAvatar, releaseAll } = hangingFetch()
    const log = logger()
    const sync = new IdpProfileSync(admin, { fetchAvatar, logger: log, slots: new AvatarFetchSlots(4) })
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push((await admin.createUser(`u${i}`, 'hash', 'viewer')).id)
    for (const [i, id] of ids.entries()) await sync.apply(id, { pictureUrl: `https://pics.example/${i}.png` })
    expect(fetchAvatar).toHaveBeenCalledTimes(4)
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ids[4], host: 'pics.example' }),
      'idp avatar fetch skipped: too many in flight',
    )
    releaseAll()
    await sync.idle()
    // Slots are free again: the dropped user's next sign-in fetches.
    await sync.apply(ids[4]!, { pictureUrl: 'https://pics.example/4.png' })
    expect(fetchAvatar).toHaveBeenCalledTimes(5)
    releaseAll()
    await sync.idle()
    expect(await avatars.head(ids[4]!)).not.toBeNull()
  })

  it('shares the cap across every sync in the process by default', async () => {
    const a = hangingFetch()
    const b = hangingFetch()
    const log = logger()
    const syncA = new IdpProfileSync(admin, { fetchAvatar: a.fetchAvatar })
    const syncB = new IdpProfileSync(admin, { fetchAvatar: b.fetchAvatar, logger: log })
    expect(SHARED_AVATAR_FETCH_SLOTS.max).toBe(4)
    for (let i = 0; i < 4; i++) {
      const id = (await admin.createUser(`a${i}`, 'hash', 'viewer')).id
      await syncA.apply(id, { pictureUrl: `https://pics.example/a${i}.png` })
    }
    await syncB.apply(userId, { pictureUrl: 'https://pics.example/b.png' })
    expect(b.fetchAvatar).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalled()
    a.releaseAll()
    await syncA.idle()
    expect(SHARED_AVATAR_FETCH_SLOTS.inFlight).toBe(0)
  })
})

describe('deprovisioning while a fetch runs', () => {
  it('never leaves an avatar row for a user deleted between the check and the write', async () => {
    const sync = new IdpProfileSync(admin, { fetchAvatar: fetchOk() })
    const read = admin.getUserById.bind(admin)
    // The user exists when the sync looks, and is deleted right after.
    vi.spyOn(admin, 'getUserById').mockImplementation(async (id) => {
      const row = await read(id)
      if (row) await admin.deleteUser(id)
      return row
    })
    await sync.scheduleAvatar(userId, 'https://pics.example/a.png')
    await sync.idle()
    vi.restoreAllMocks()
    expect(await read(userId)).toBeNull()
    expect(await avatars.head(userId)).toBeNull()
  })
})

describe('OIDC claims → identity', () => {
  it('takes email, email_verified and picture, preferring the ID token’s email', () => {
    const claims = { sub: 's1', email: 'tok@idp.example', email_verified: false, picture: 'https://p/1.png' }
    const id = identityFromOidcClaims(claims, { ...claims, email: 'ui@idp.example' }, { groupsClaim: 'groups' })
    expect(id.email).toBe('tok@idp.example')
    expect(id.emailVerified).toBe(false)
    expect(id.pictureUrl).toBe('https://p/1.png')
  })

  it('falls back to userinfo for an email the token omitted, and reads a string email_verified', () => {
    const id = identityFromOidcClaims(
      { sub: 's1' },
      { sub: 's1', email: 'ui@idp.example', email_verified: 'true' },
      { groupsClaim: 'groups' },
    )
    expect(id.email).toBe('ui@idp.example')
    expect(id.emailVerified).toBe(true)
    expect(id.pictureUrl).toBeNull()
  })

  it('reads a string email_verified case-insensitively', () => {
    const verified = (v: unknown) =>
      identityFromOidcClaims({ sub: 's1', email: 'a@b.example', email_verified: v }, { sub: 's1' }, { groupsClaim: 'groups' })
        .emailVerified
    expect(verified('False')).toBe(false)
    expect(verified('FALSE')).toBe(false)
    expect(verified(' false ')).toBe(false)
    expect(verified('TRUE')).toBe(true)
    expect(verified('True')).toBe(true)
    expect(verified('maybe')).toBeNull()
  })

  it('reports an absent email_verified as unknown, not false', () => {
    const id = identityFromOidcClaims({ sub: 's1', email: 'a@b.example' }, { sub: 's1', email: 'a@b.example' }, { groupsClaim: 'groups' })
    expect(id.emailVerified).toBeNull()
  })
})

describe('SAML profile → identity', () => {
  const base = { issuer: 'idp', nameID: 'olivia', nameIDFormat: 'unspecified' } as Profile
  const cfg = { emailAttribute: 'email', groupsAttribute: 'groups' }

  it('reads the configured email attribute, multi-valued included', () => {
    const id = identityFromSamlProfile({ ...base, mailAddr: ['o@idp.example', 'x@idp.example'] } as Profile, {
      ...cfg,
      emailAttribute: 'mailAddr',
    })
    expect(id.email).toBe('o@idp.example')
  })

  it('falls back to the Azure/ADFS email claim URI, then a NameID in email format', () => {
    const azure = identityFromSamlProfile(
      { ...base, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'az@idp.example' } as Profile,
      cfg,
    )
    expect(azure.email).toBe('az@idp.example')
    const nameId = identityFromSamlProfile({ ...base, nameID: 'n@idp.example' } as Profile, cfg)
    expect(nameId.email).toBe('n@idp.example')
  })

  it('reads a picture from the configured attribute, or the common names when none is configured', () => {
    expect(identityFromSamlProfile({ ...base, photo: 'https://p/2.png' } as Profile, cfg).pictureUrl).toBe('https://p/2.png')
    expect(
      identityFromSamlProfile({ ...base, photo: 'https://p/2.png', thumb: 'https://p/3.png' } as Profile, {
        ...cfg,
        pictureAttribute: 'thumb',
      }).pictureUrl,
    ).toBe('https://p/3.png')
    expect(identityFromSamlProfile(base, cfg).pictureUrl).toBeNull()
  })
})
