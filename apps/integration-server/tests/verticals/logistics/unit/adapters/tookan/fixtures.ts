/**
 * Tookan task data, copied from the documented examples in
 * https://jsapi.apiary.io/apis/tookanapi.apib. get_all_tasks documents its
 * response only as "data": {<Array of task data>}, so the task objects come
 * from the two task examples the blueprint does spell out.
 */
import type { TookanTaskOrder } from '../../../../../../src/verticals/logistics/adapters/tookan/transform/order'

/** "Get All Related Tasks" response, first task (fields the transform reads, plus neighbours). */
export function docRelatedTask(o: Partial<TookanTaskOrder> = {}): TookanTaskOrder {
  return {
    job_id: 123456,
    created_by: 5,
    order_id: null,
    team_id: 0,
    job_description: 'groceries delivery',
    job_pickup_datetime: '2018-10-29T19:00:00.000Z',
    job_pickup_name: '7 Eleven Store',
    job_pickup_phone: '+1 201555555',
    job_delivery_datetime: '2018-10-29T21:00:00.000Z',
    job_pickup_address: 'Sector 26, Chandigarh, India',
    job_pickup_email: '',
    customer_username: '7 Eleven Store',
    customer_email: '',
    customer_phone: '+1 201555555',
    job_address: 'Sector 26, Chandigarh, India',
    creation_datetime: '2018-10-29T09:40:28.000Z',
    customer_id: 292130,
    arrived_datetime: '0000-00-00 00:00:00',
    started_datetime: '0000-00-00 00:00:00',
    completed_datetime: '0000-00-00 00:00:00',
    job_status: 6,
    job_type: 0,
    ...o,
  }
}

/** "Get Task Details" response, data[0]. */
export function docJobDetails(o: Partial<TookanTaskOrder> = {}): TookanTaskOrder {
  return {
    fleet_id: 189,
    fleet_name: 'Chandra',
    user_id: 222,
    customer_username: 'Joey Tribianni',
    customer_phone: '+91 99869 06722',
    customer_email: 'Joey@yahoo.com',
    job_pickup_email: null,
    job_pickup_name: '',
    job_pickup_phone: '0',
    job_address: '36 Pennock Crescent,Unionville,L3R,3M4 CA',
    job_status: 0,
    job_description: '#7717700',
    job_pickup_datetime: 'Invalid date',
    job_id: 5145,
    job_delivery_datetime: '12/06/2017 10:00 am',
    job_type: 1,
    job_pickup_address: '',
    started_datetime: '',
    started_datetime_utc: '2017-12-06 12:29:47',
    completed_datetime_utc: '2017-12-06 12:37:16',
    completed_datetime: '',
    tracking_link: 'https://jngl.ml/5bCScff',
    task_history: [],
    ...o,
  }
}
