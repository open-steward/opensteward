import bcrypt from 'bcrypt'
import type { AdminStore, UserRow } from '../db/admin-store'

const SALT_ROUNDS = 12

export async function createUser(
  store: AdminStore,
  username: string,
  password: string,
  role: 'admin' | 'operator' | 'viewer',
): Promise<UserRow> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  return store.createUser(username, hash, role)
}

export async function verifyPassword(
  store: AdminStore,
  username: string,
  password: string,
): Promise<UserRow | null> {
  const user = store.getUserByUsername(username)
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  return valid ? user : null
}
