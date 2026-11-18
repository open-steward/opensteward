/**
 * The Superset deployment files agree with each other and with what
 * admin-api assumes:
 *
 *   - the Helm chart's copies of deploy/superset/*.py are byte-identical (the
 *     chart can only read files inside itself, so it carries copies);
 *   - superset_config.py keeps the settings the embedding security model rests
 *     on (guest role, 5-minute tokens, frame-ancestors, no public role);
 *   - compose, the Superset Dockerfile and the Helm values pin the same image;
 *   - every analytics compose service sits behind the `analytics` profile, so
 *     a default `docker compose up` is unchanged.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const ROOT = resolve(import.meta.dirname, '../../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('Superset deployment files', () => {
  it('ships identical copies of the config and role bootstrap in the Helm chart', () => {
    for (const f of ['superset_config.py', 'bootstrap-roles.py']) {
      expect(read(`deploy/helm/opensteward/files/superset/${f}`), f).toBe(
        read(`deploy/superset/${f}`),
      )
    }
  })

  it('keeps the settings embedding relies on', () => {
    const cfg = read('deploy/superset/superset_config.py')
    expect(cfg).toContain('"EMBEDDED_SUPERSET": True')
    expect(cfg).toContain('"DASHBOARD_RBAC": True')
    expect(cfg).toContain('GUEST_ROLE_NAME = "OpenStewardGuest"')
    expect(cfg).toContain('GUEST_TOKEN_JWT_EXP_SECONDS = 300')
    expect(cfg).toContain('GUEST_TOKEN_JWT_SECRET =')
    expect(cfg).toContain('"frame-ancestors": ["\'self\'", *ADMIN_ORIGINS]')
    expect(cfg).toContain('PUBLIC_ROLE_LIKE = None')
    expect(cfg).toContain('PREVENT_UNSAFE_DB_CONNECTIONS = True')
    expect(cfg).toContain('TALISMAN_ENABLED = True')
    expect(read('deploy/superset/bootstrap-roles.py')).toContain('GUEST_ROLE = "OpenStewardGuest"')
  })

  it('pins one Superset version across compose, the Dockerfile and Helm', () => {
    const docker = /FROM apache\/superset:(\S+)/.exec(read('deploy/superset/Dockerfile'))![1]
    const compose = load(read('docker-compose.yml')) as {
      services: Record<string, { image?: string; profiles?: string[] }>
    }
    expect(compose.services['superset']!.image).toBe(`opensteward-superset:${docker}`)
    expect(compose.services['superset-init']!.image).toBe(`opensteward-superset:${docker}`)
    const values = load(read('deploy/helm/opensteward/values.yaml')) as {
      superset: { image: { tag: string }; enabled: boolean }
    }
    expect(values.superset.image.tag).toBe(docker)
    expect(values.superset.enabled).toBe(false)
  })

  it('keeps every analytics service behind the analytics profile', () => {
    const compose = load(read('docker-compose.yml')) as {
      services: Record<string, { profiles?: string[] }>
    }
    for (const name of [
      'postgres',
      'superset-redis',
      'superset-init',
      'superset',
      'superset-bootstrap',
    ]) {
      expect(compose.services[name]?.profiles, name).toEqual(['analytics'])
    }
  })
})
