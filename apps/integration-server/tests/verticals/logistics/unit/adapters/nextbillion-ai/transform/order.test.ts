import { describe, it, expect } from 'vitest'
import {
  transformOptTask,
  transformOptJob,
  type NBOptTask,
  type NBOptJob,
} from '../../../../../../../src/verticals/logistics/adapters/nextbillion-ai/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOptTask(overrides: Partial<NBOptTask> = {}): NBOptTask {
  return {
    id: 'task-001',
    status: 'Ok',
    result: {
      code: 0,
      summary: {
        cost: 1200,
        unassigned: 0,
        delivery: [5],
        pickup: [],
        service: 300,
        duration: 3600,
        waiting_time: 0,
        distance: 50000,
      },
      routes: [
        {
          vehicle: 1,
          cost: 600,
          delivery: [2],
          pickup: [],
          service: 150,
          duration: 1800,
          waiting_time: 0,
          distance: 25000,
          steps: [],
        },
        {
          vehicle: 2,
          cost: 600,
          delivery: [3],
          pickup: [],
          service: 150,
          duration: 1800,
          waiting_time: 0,
          distance: 25000,
          steps: [],
        },
      ],
      unassigned: [],
    },
    ...overrides,
  }
}

function makeOptJob(overrides: Partial<NBOptJob> = {}): NBOptJob {
  return {
    id: 42,
    description: 'Deliver package to customer',
    location_index: 3,
    service: 300,
    time_windows: [[1709294400, 1709308800]],
    priority: 1,
    ...overrides,
  }
}

describe('nextbillion-ai transformOptTask', () => {
  it('maps id from task id', () => {
    expect(transformOptTask(makeOptTask()).id).toBe('task-001')
  })

  it('maps orderNumber from task id', () => {
    expect(transformOptTask(makeOptTask()).orderNumber).toBe('task-001')
  })

  it('maps status "Ok" with no unassigned → AWAITING_SHIPMENT', () => {
    expect(transformOptTask(makeOptTask()).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps status "Error" → CANCELLED', () => {
    expect(transformOptTask(makeOptTask({ status: 'Error' })).status).toBe('CANCELLED')
  })

  it('maps status to PROCESSING when unassigned items exist', () => {
    const task = makeOptTask()
    task.result!.unassigned = [{ id: 99 }]
    expect(transformOptTask(task).status).toBe('PROCESSING')
  })

  it('maps totalAmount from summary.cost', () => {
    expect(transformOptTask(makeOptTask()).totalAmount).toBe(1200)
  })

  it('maps shipmentIds from vehicle ids in routes', () => {
    const result = transformOptTask(makeOptTask())
    expect(result.shipmentIds).toEqual(['1', '2'])
  })

  it('includes distance and duration in notes', () => {
    const result = transformOptTask(makeOptTask())
    expect(result.notes).toContain('distance=50000m')
    expect(result.notes).toContain('duration=3600s')
  })

  it('omits shipmentIds when routes array is empty', () => {
    const task = makeOptTask()
    task.result!.routes = []
    expect(transformOptTask(task).shipmentIds).toBeUndefined()
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOptTask(makeOptTask()))).not.toThrow()
  })
})

describe('nextbillion-ai transformOptJob', () => {
  it('maps id as string', () => {
    expect(transformOptJob(makeOptJob()).id).toBe('42')
  })

  it('maps orderNumber as string', () => {
    expect(transformOptJob(makeOptJob()).orderNumber).toBe('42')
  })

  it('maps status always as PENDING', () => {
    expect(transformOptJob(makeOptJob()).status).toBe('PENDING')
  })

  it('maps notes from description', () => {
    expect(transformOptJob(makeOptJob()).notes).toBe('Deliver package to customer')
  })

  it('maps orderAt from first time_window start (unix ms → Date)', () => {
    const result = transformOptJob(makeOptJob())
    expect(result.orderAt).toBeInstanceOf(Date)
  })

  it('omits orderAt when time_windows is empty', () => {
    const result = transformOptJob(makeOptJob({ time_windows: [] }))
    expect(result.orderAt).toBeUndefined()
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOptJob(makeOptJob()))).not.toThrow()
  })
})
