import bcrypt from 'bcrypt'
import type { AdminStore, UserRow } from '../db/admin-store'

const SALT_ROUNDS = 12

export async function createUser(
  store: AdminStore,
  username: string,
  password: string,
  role: 'admin' | 'operator' | 'viewer',
  opts: { email?: string | null } = {},
): Promise<UserRow> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  // An email an admin types is `manual`: SSO never overwrites it.
  return await store.createUser(username, hash, role, {
    ...(opts.email ? { email: opts.email, emailSource: 'manual' as const } : {}),
  })
}

export async function resetPassword(
  store: AdminStore,
  userId: string,
  password: string,
): Promise<UserRow | null> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  return await store.setUserPassword(userId, hash)
}

export async function verifyPassword(
  store: AdminStore,
  username: string,
  password: string,
): Promise<UserRow | null> {
  const user = await store.getUserByUsername(username)
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  return valid ? user : null
}
