/**
 * MantisBT comments (issue notes) are read from the issue itself.
 *
 * The REST routes in
 * https://raw.githubusercontent.com/mantisbt/mantisbt/master/api/rest/restcore/issues_rest.php
 * register only `$g_app->post( '/{id}/notes', 'rest_issue_note_add' )` and
 * `$g_app->delete( '/{id}/notes/{note_id}', 'rest_issue_note_delete' )` on
 * notes: there is no GET /issues/{id}/notes, so the adapter's old read 404'd.
 * `$g_app->get( '/{id}', 'rest_issue_get' )` answers
 * `array( 'issues' => array( $t_issue ) )`, and mci_issue_data_as_array in
 * https://raw.githubusercontent.com/mantisbt/mantisbt/master/api/soap/mc_issue_api.php
 * fills `$t_issue['notes'] = mci_issue_get_notes( ... )` (null when there are
 * none) whenever `select` is absent or names `notes`. That is every visible
 * note of the issue, so the list is paged locally.
 *
 * The fake honours ONLY `select` (the one documented query parameter of
 * GET /issues/{id}) and returns only the selected fields.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MantisbtAdapter } from '../../../../../../src/verticals/projects/adapters/mantisbt/index'
import { CommentSchema } from '../../../../../../src/verticals/projects/schema/comment'

const HOST = 'https://mantis.example.test'
const ISSUE_ID = '1234'
const adapter = new MantisbtAdapter()
const CREDS = { accessToken: 'mantis_token', extra: { host: HOST } }

/**
 * A note in the shape mci_issue_note_data_as_array emits over REST:
 * id, reporter, text, view_state, attachments, type, created_at, updated_at.
 * Values follow the note examples in the vendor's Postman collection.
 */
function note(id: number) {
  return {
    id,
    reporter: {
      id: 36771,
      name: 'vboctoradmin',
      real_name: 'Victor Admin',
      email: 'vboctor@mantisbt.org',
    },
    text: `note ${id}`,
    view_state: { id: 10, name: 'public', label: 'public' },
    attachments: [],
    type: 'note',
    created_at: '2017-04-23T13:12:28-04:00',
    updated_at: '2017-04-23T13:12:28-04:00',
  }
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: {} } })
}

function fakeMantis(noteCount: number, opts: { noIssue?: boolean } = {}): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== HOST) throw httpError(404)
    if (url.pathname !== `/api/rest/issues/${ISSUE_ID}`) throw httpError(404)
    for (const k of url.searchParams.keys()) if (k !== 'select') throw httpError(400)
    const full: Record<string, unknown> = {
      id: Number(ISSUE_ID),
      summary: 'Sample issue title',
      project: { id: 1, name: 'mantisbt' },
      notes: noteCount === 0 ? null : Array.from({ length: noteCount }, (_, i) => note(54527 + i)),
    }
    const select = url.searchParams.get('select')
    const issue = select
      ? Object.fromEntries(select.split(',').map((f) => [f.trim(), full[f.trim()]]))
      : full
    const data = { issues: opts.noIssue ? [] : [issue] }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

describe('mantisbt listComments reads the notes embedded in GET /issues/{id}', () => {
  it('calls GET /api/rest/issues/{id} with select=id,project,notes, never /notes', async () => {
    fakeMantis(2)
    await adapter.listComments(CREDS, ISSUE_ID, { page: 1, limit: 10 })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pathname).toBe(`/api/rest/issues/${ISSUE_ID}`)
    expect(seen[0]!.searchParams.get('select')).toBe('id,project,notes')
  })

  it('maps each note to a CommentSchema-valid comment with task and project ids', async () => {
    fakeMantis(1)
    const [c] = await adapter.listComments(CREDS, ISSUE_ID, { page: 1, limit: 10 })
    expect(() => CommentSchema.parse(c)).not.toThrow()
    expect(c).toMatchObject({
      id: `${ISSUE_ID}:54527`,
      externalId: '54527',
      taskId: ISSUE_ID,
      projectId: '1',
      authorId: '36771',
      body: 'note 54527',
      attachmentCount: 0,
      createdAt: '2017-04-23T17:12:28.000Z',
    })
  })

  it('an issue with no notes (notes: null) is an empty, finished list', async () => {
    fakeMantis(0)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listComments(CREDS, ISSUE_ID, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('rejects, rather than reporting an empty finished list, when the issue is absent', async () => {
    fakeMantis(2, { noIssue: true })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter.listComments(CREDS, ISSUE_ID, params)).rejects.toThrow(/not found/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('walks 2L+1 notes over three pages, every id once, hasMore exact', async () => {
    const L = 4
    fakeMantis(2 * L + 1)
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listComments(CREDS, ISSUE_ID, params)
      got.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(got).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(54527 + i)))
    expect(new Set(got).size).toBe(got.length)
    expect(more).toEqual([true, true, false])
  })
})

describe('mantisbt getComment reads back a listed comment id', () => {
  it('finds the note by the id listComments returned, via GET /issues/{id}', async () => {
    fakeMantis(3)
    const listed = await adapter.listComments(CREDS, ISSUE_ID, { page: 1, limit: 10 })
    const got = await adapter.getComment(CREDS, listed[1]!.id)
    expect(got).toEqual(listed[1])
    expect(got).toMatchObject({ externalId: '54528', taskId: ISSUE_ID, projectId: '1' })
    expect(seen.every((u) => u.pathname === `/api/rest/issues/${ISSUE_ID}`)).toBe(true)
  })

  it('throws when the note is not on the issue', async () => {
    fakeMantis(1)
    await expect(adapter.getComment(CREDS, `${ISSUE_ID}:999`)).rejects.toThrow(/not found/)
  })
})
