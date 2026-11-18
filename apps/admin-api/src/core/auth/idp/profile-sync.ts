/**
 * Copy the email address and profile picture an identity provider asserts
 * onto the console user — at every SSO sign-in (OIDC, SAML, LDAP) and every
 * SCIM create/replace/patch.
 *
 * Precedence, the same for both fields: what a person set in the console wins.
 *
 *   - Email. `email_source = 'manual'` (an admin typed it) is never
 *     overwritten. Otherwise the IdP's address is stored as `idp` and
 *     refreshed whenever it changes. An OIDC address the IdP marks
 *     `email_verified: false` is ignored, as is anything that is not a valid
 *     address. An IdP that sends no address changes nothing.
 *   - Picture. An uploaded picture (`source = 'upload'`) is never replaced.
 *     An IdP picture is refetched only when the URL changes — the sha256 of
 *     the URL is stored beside the bytes — so an unchanged sign-in costs a
 *     single metadata read. An IdP that sends no picture changes nothing
 *     (only an explicit SCIM `remove` of `photos` drops an IdP picture).
 *
 * Timing — why the picture is fire-and-forget:
 *
 *   The email is a local write and is applied before the sign-in completes.
 *   The picture is a request to a host the IdP names, which can take up to
 *   the fetch's full 5 s budget. Awaiting it would put a third party's
 *   latency (and outages) into every sign-in redirect and every SCIM
 *   request, for a cosmetic field. So the fetch is started and NOT awaited:
 *   the sign-in answers at once and the picture appears on the next page
 *   load. The fetch is still bounded (5 s, 512 KB) so a stalled host cannot
 *   pile up work, and concurrent sign-ins of one user share one fetch.
 *
 * Nothing here can fail a sign-in: every error is caught and logged — the
 * reason and the host only, never the URL (query strings carry signatures)
 * and never the address.
 */
import type { AdminStore } from '../../db/admin-store'
import { UserAvatarStore, hashAvatarSourceUrl } from '../../db/user-avatar-store'
import { normalizeEmail } from '../../users/email'
import { AvatarFetchError, fetchIdpAvatar, type FetchedAvatar } from './avatar-fetch'

/** What an IdP asserted about a person's profile. */
export interface IdpProfile {
  /** The IdP's address for the user; undefined/null when it sent none. */
  email?: string | null
  /** OIDC `email_verified`. `false` means the address is ignored. */
  emailVerified?: boolean | null
  /** Absolute URL of the user's picture; undefined/null when it sent none. */
  pictureUrl?: string | null
}

export type AvatarFetcher = (url: string) => Promise<FetchedAvatar>

export interface ProfileSyncLogger {
  info(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
  debug(obj: Record<string, unknown>, msg: string): void
}

/**
 * A process-wide cap on picture fetches in flight. Each fetch holds a socket
 * and up to 512 KB for up to 5 s; without a cap, a burst of sign-ins (or an
 * IdP pushing a large SCIM sync) could open as many at once. When every slot
 * is taken the fetch is dropped, not queued — the picture is cosmetic and the
 * user's next sign-in (or SCIM update) tries again.
 */
export class AvatarFetchSlots {
  private used = 0
  constructor(readonly max: number) {}

  get inFlight(): number {
    return this.used
  }

  /** A release function, or null when every slot is taken. */
  tryAcquire(): (() => void) | null {
    if (this.used >= this.max) return null
    this.used += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.used -= 1
    }
  }
}

/** The one cap every `IdpProfileSync` in the process shares by default. */
export const SHARED_AVATAR_FETCH_SLOTS = new AvatarFetchSlots(4)

export interface IdpProfileSyncOptions {
  /** Defaults to `fetchIdpAvatar` with its SSRF guard. Tests inject a stub. */
  fetchAvatar?: AvatarFetcher
  logger?: ProfileSyncLogger
  /** Defaults to `SHARED_AVATAR_FETCH_SLOTS` (process-wide). */
  slots?: AvatarFetchSlots
}

const silent: ProfileSyncLogger = { info: () => {}, warn: () => {}, debug: () => {} }

/** Host of a URL for a log line — never its path or query. */
function hostForLog(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(invalid url)'
  }
}

export class IdpProfileSync {
  private readonly avatars: UserAvatarStore
  private readonly fetchAvatar: AvatarFetcher
  private readonly log: ProfileSyncLogger
  private readonly slots: AvatarFetchSlots
  /** One in-flight fetch per user; the key includes the URL hash. */
  private readonly inflight = new Map<string, Promise<void>>()

  constructor(
    private readonly adminStore: AdminStore,
    opts: IdpProfileSyncOptions = {},
  ) {
    this.avatars = UserAvatarStore.for(adminStore)
    this.fetchAvatar = opts.fetchAvatar ?? ((url) => fetchIdpAvatar(url))
    this.log = opts.logger ?? silent
    this.slots = opts.slots ?? SHARED_AVATAR_FETCH_SLOTS
  }

  /**
   * Apply an IdP profile to a user: the email now, the picture in the
   * background. Never throws.
   */
  async apply(userId: string, profile: IdpProfile): Promise<void> {
    try {
      await this.syncEmail(userId, profile)
    } catch (err) {
      this.log.warn({ userId, err: (err as Error)?.message }, 'idp email sync failed')
    }
    try {
      await this.scheduleAvatar(userId, profile.pictureUrl)
    } catch (err) {
      this.log.warn({ userId, err: (err as Error)?.message }, 'idp avatar sync could not start')
    }
  }

  /** Store the IdP's address unless an admin owns the email. */
  async syncEmail(userId: string, profile: IdpProfile): Promise<'set' | 'unchanged' | 'kept_manual' | 'ignored'> {
    if (profile.emailVerified === false) return 'ignored'
    const email = normalizeEmail(profile.email)
    if (!email) return 'ignored'
    const user = await this.adminStore.getUserById(userId)
    if (!user) return 'ignored'
    if (user.email && user.email_source === 'manual') return 'kept_manual'
    if (user.email === email && user.email_source === 'idp') return 'unchanged'
    // Conditional in SQL: an admin's edit that landed since the read above wins.
    return (await this.adminStore.setIdpEmail(userId, email)) ? 'set' : 'kept_manual'
  }

  /**
   * Start (without awaiting) a fetch of the IdP picture when it may be
   * needed. Resolves once the decision is made, not when the fetch ends.
   */
  async scheduleAvatar(userId: string, pictureUrl: string | null | undefined): Promise<void> {
    if (!pictureUrl || typeof pictureUrl !== 'string') return
    const head = await this.avatars.head(userId)
    if (head?.source === 'upload') return
    const urlHash = hashAvatarSourceUrl(pictureUrl)
    if (head?.source === 'idp' && head.sourceUrlHash === urlHash) return
    const key = `${userId}\u0000${urlHash}`
    if (this.inflight.has(key)) return
    const release = this.slots.tryAcquire()
    if (!release) {
      this.log.debug(
        { userId, host: hostForLog(pictureUrl) },
        'idp avatar fetch skipped: too many in flight',
      )
      return
    }
    const run = this.fetchAndStore(userId, pictureUrl, urlHash).finally(() => {
      release()
      this.inflight.delete(key)
    })
    this.inflight.set(key, run)
  }

  /** Remove an IdP-sourced picture (never an upload). */
  async removeIdpAvatar(userId: string): Promise<void> {
    await this.avatars.delete(userId, { onlySource: 'idp' })
  }

  /** Clear an IdP-sourced email (never a manual one). */
  async clearIdpEmail(userId: string): Promise<void> {
    const user = await this.adminStore.getUserById(userId)
    if (user?.email && user.email_source === 'idp') {
      // Conditional in SQL, as for a set: never clears an admin's address.
      await this.adminStore.setIdpEmail(userId, null)
    }
  }

  /** Settles once every background fetch started so far has finished. */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight.values()])
    }
  }

  private async fetchAndStore(userId: string, url: string, urlHash: string): Promise<void> {
    try {
      const picture = await this.fetchAvatar(url)
      // Deprovisioned while the fetch ran: skip the write. `putFromIdp`
      // re-checks after writing, which closes the window between the two.
      if (!(await this.adminStore.getUserById(userId))) return
      const stored = await this.avatars.putFromIdp({
        userId,
        contentType: picture.contentType,
        bytes: picture.bytes,
        sourceUrlHash: urlHash,
      })
      if (!stored) {
        this.log.info({ userId }, 'idp avatar discarded: the user uploaded one meanwhile')
      }
    } catch (err) {
      const reason = err instanceof AvatarFetchError ? err.reason : 'error'
      this.log.info({ userId, host: hostForLog(url), reason }, 'idp avatar not fetched')
    }
  }
}
