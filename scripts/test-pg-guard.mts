/**
 * The TEST_PG_URL guard for scripts/test-pg.sh.
 *
 * The Postgres suites DROP the `public` schema of the database they are given.
 * A throwaway container is safe by construction; a URL handed in through
 * TEST_PG_URL may not be. Refuse one that looks like a real OpenSteward
 * database — named `opensteward` (what the compose stack creates), or whose
 * `public._schema_migrations` records applied migrations — unless
 * TEST_PG_FORCE=1 says the operator knows.
 *
 *   node scripts/test-pg-guard.mts <url>     exit 0 = go, 3 = refused, 1 = error
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// `pg` is a dependency of @opensteward/shared, not of the repository root.
const requireFromShared = createRequire(new URL('../packages/shared/package.json', import.meta.url))

interface PgClient {
  connect(): Promise<void>
  query(text: string): Promise<{ rows: Array<Record<string, unknown>> }>
  end(): Promise<void>
}

/** Why `url` must not be used (null = fine). Never includes credentials. */
export async function testDatabaseRefusal(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (env['TEST_PG_FORCE'] === '1') return null
  const u = new URL(url)
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (database === 'opensteward') {
    return (
      `the database is named "opensteward", the compose stack's own database, and the ` +
      `suites drop its public schema`
    )
  }
  const { Client } = requireFromShared('pg') as { Client: new (o: object) => PgClient }
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 })
  await client.connect()
  try {
    const present = await client.query(
      `SELECT to_regclass('public._schema_migrations') IS NOT NULL AS present`,
    )
    if (!present.rows[0]?.['present']) return null
    const n = await client.query(`SELECT COUNT(*)::int AS n FROM public._schema_migrations`)
    const applied = Number(n.rows[0]?.['n'] ?? 0)
    return applied > 0
      ? `public._schema_migrations records ${applied} applied migration(s): this looks like a ` +
          `real OpenSteward database, and the suites drop its public schema`
      : null
  } finally {
    await client.end()
  }
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const url = process.argv[2]
  if (!url) {
    console.error('usage: node scripts/test-pg-guard.mts <postgres-url>')
    process.exit(2)
  }
  testDatabaseRefusal(url).then(
    (reason) => {
      if (reason) {
        console.error(`test:pg: refusing TEST_PG_URL: ${reason}.`)
        console.error('  Point it at a throwaway database, or set TEST_PG_FORCE=1 if you mean it.')
        process.exit(3)
      }
    },
    (err: unknown) => {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
      console.error(`test:pg: cannot inspect TEST_PG_URL: ${msg}`)
      process.exit(1)
    },
  )
}
