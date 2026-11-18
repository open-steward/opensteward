import { avatarApiUrl, avatarVersion } from '../db/user-avatar-store'

/**
 * The profile fields every console-user view carries (`GET /api/users`,
 * `GET /api/users/:id`, `GET /api/auth/me`): the email, and a versioned
 * avatar URL that changes whenever the picture does, so a client can cache
 * it and still see a new one at once. Both are null when absent.
 *
 * `sha256` comes from `UserAvatarStore.versions()` / `head()` — a list view
 * never reads a blob to build these.
 */
export function profileFields(
  user: { id: string; email?: string | null },
  sha256: string | undefined | null,
): { email: string | null; avatarUrl: string | null; avatarVersion: string | null } {
  return {
    email: user.email ?? null,
    avatarUrl: sha256 ? avatarApiUrl(user.id, sha256) : null,
    avatarVersion: sha256 ? avatarVersion(sha256) : null,
  }
}
