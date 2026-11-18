/**
 * The scanner behind every service's "profile matches server.ts" test: which
 * calls receive a database handle. A store that takes the handle inside an
 * object literal (`X.create({ handle: credHandle })`) must be seen too, or a
 * store added that way would escape the drift net.
 */
import { describe, expect, it } from 'vitest'
import { callsReceiving } from '../../src/db-copy'

describe('callsReceiving', () => {
  it('finds positional, object-property and shorthand arguments, and `new`', () => {
    const src = `
      const a = await AStore.create(credHandle, secret)
      const b = await BService.create({
        dialect: 'postgres',
        handle: credHandle,
        logger,
      })
      const c = new CStore(credHandle)
      const d = await DStore.create({ credHandle })
      const e = await EStore.create(someOtherHandle)
    `
    expect(callsReceiving(src, 'credHandle')).toEqual(['AStore', 'BService', 'CStore', 'DStore'])
  })

  it('ignores declarations, assignments, conditions, member calls, comments and strings', () => {
    const src = `
      // FakeStore.create(credHandle) in a comment
      /* OtherStore.create(credHandle) in a block comment */
      const credHandle = await openDb({ sqlitePath: 'x' })
      let later: DbHandle | undefined = credHandle
      if (credHandle && ready) log('credHandle ready: http://x')
      const s = 'StringStore.create(credHandle)'
      const t = \`TemplateStore.create(credHandle)\`
      await credHandle.close()
      const real = await RealStore.create(credHandle)
    `
    expect(callsReceiving(src, 'credHandle')).toEqual(['RealStore'])
  })

  it('does not count a parameter list as a call', () => {
    const src = `
      export const P = {
        open: async (handle) => { await AStore.create(handle) },
        other: (handle) => BStore.create(handle),
      }
      async function f(handle) { return new CStore(handle) }
    `
    expect(callsReceiving(src, 'handle')).toEqual(['AStore', 'BStore', 'CStore'])
  })

  it('does not match an identifier that merely contains the name', () => {
    expect(
      callsReceiving('X.create(handleFoo); Y.create(myhandle); Z.create(handle)', 'handle'),
    ).toEqual(['Z'])
  })
})
