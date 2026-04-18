import { createSessionTestApp } from './server/__tests__/helpers/fastifyTestApp.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });
const app = await createSessionTestApp({ dataDir: '/tmp/test-json-err', logger });
await app.ready();

const resp = await app.inject({
  method: 'POST',
  url: '/api/portfolio/test123',
  headers: { 'content-type': 'application/json', 'x-session-token': 'desktop-session-token' },
  payload: '{ invalid json }',
});
console.log('STATUS:', resp.statusCode);
console.log('BODY:', resp.body);
await app.close();
