/**
 * Tests for the analytics catalog lock guard: unchanged, additive, breaking,
 * missing lock — and the real catalog matching the committed lock.
 *
 * Run: `pnpm exec tsx --test scripts/check-analytics-catalog.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LOCK_PATH,
  checkAnalyticsCatalog,
  shapeHash,
  shapeOf,
  type CatalogLock,
} from './check-analytics-catalog.ts'
import {
  buildCatalog,
  diffCatalogs,
} from '../apps/integration-server/src/analytics/view-catalog.ts'

const col = (name: string, type = 'text') => ({ name, type, maskedType: type })
const catalog = (cols: ReturnType<typeof col>[], extraView = false) => ({
  views: [
    { name: 'crm_contacts', columns: cols },
    ...(extraView ? [{ name: 'crm_deals', columns: [col('id')] }] : []),
  ],
})
const lockOf = (c: ReturnType<typeof catalog>, version = 1): CatalogLock => {
  const views = shapeOf(c)
  return { version, shapeHash: shapeHash(views), views }
}

test('unchanged catalog → ok, lock kept', () => {
  const c = catalog([col('id'), col('email')])
  const r = checkAnalyticsCatalog(lockOf(c), c, diffCatalogs)
  assert.equal(r.status, 'ok')
  assert.equal(r.next.version, 1)
})

test('a new column or view → additive, same version', () => {
  const lock = lockOf(catalog([col('id')]))
  const r = checkAnalyticsCatalog(lock, catalog([col('id'), col('email')], true), diffCatalogs)
  assert.equal(r.status, 'additive')
  assert.deepEqual(r.additive, ['column crm_contacts.email added', 'view crm_deals added'])
  assert.equal(r.next.version, 1)
})

test('a removed column or changed type → breaking, version bumped', () => {
  const lock = lockOf(catalog([col('id'), col('email'), col('amount', 'numeric')]), 3)
  const r = checkAnalyticsCatalog(lock, catalog([col('id'), col('amount', 'text')]), diffCatalogs)
  assert.equal(r.status, 'breaking')
  assert.deepEqual(r.breaking, [
    'column crm_contacts.amount type numeric/numeric → text/text',
    'column crm_contacts.email removed',
  ])
  assert.equal(r.next.version, 4)
})

test('no lock → breaking, so the first lock is committed deliberately', () => {
  const r = checkAnalyticsCatalog(null, catalog([col('id')]), diffCatalogs)
  assert.equal(r.status, 'breaking')
  assert.equal(r.next.version, 1)
})

test('the committed lock matches the real catalog', () => {
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as CatalogLock
  const r = checkAnalyticsCatalog(lock, buildCatalog(), diffCatalogs)
  assert.notEqual(r.status, 'breaking', r.breaking.join('\n'))
})
