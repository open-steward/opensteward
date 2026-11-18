/**
 * Shared YAML config loader.
 *
 * Reads from CONFIG_PATH env var (default: config/config.yml), parses YAML,
 * and returns typed config. Falls back to defaults if file doesn't exist.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { load } from 'js-yaml'
import type { BaseConfig } from './base-config'

/**
 * Recursive deep merge for plain objects. Arrays and primitives in `source`
 * replace those in `target`. Objects are merged key-by-key.
 *
 * Used by loadConfig so that, e.g., defaults `store: { path, secret }` and
 * YAML `store: { path }` produce `store: { path: <yaml>, secret: <default> }`
 * instead of dropping the env-derived secret.
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) }
  for (const [key, value] of Object.entries(source)) {
    const targetVal = (target as Record<string, unknown>)[key]
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      out[key] = deepMerge(targetVal, value as Record<string, unknown>)
    } else {
      out[key] = value
    }
  }
  return out as T
}

/**
 * Load a YAML config file, returning the parsed object cast to T.
 *
 * Performs a *deep* merge of YAML over defaults so partial sub-objects in
 * YAML (e.g. `store: { path: ... }`) don't clobber env-derived sibling fields
 * (e.g. `store.secret`).
 *
 * @param defaults - Default config values used when no config file exists
 * @param configPath - Override config file path (default: CONFIG_PATH env or config/config.yml)
 */
export function loadConfig<T extends BaseConfig>(defaults: T, configPath?: string): T {
  const path =
    configPath ?? process.env['CONFIG_PATH'] ?? resolve(process.cwd(), 'config/config.yml')

  if (!existsSync(path)) {
    return defaults
  }

  const raw = readFileSync(path, 'utf8')
  const parsed = load(raw) as Partial<T>

  return deepMerge(defaults, parsed)
}
