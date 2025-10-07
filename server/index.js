import pino from 'pino';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { scheduleNightlyClose } from './jobs/scheduler.js';

const config = loadConfig();
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const rootLogger = pino({ base: { module: 'server' } });
const appLogger = rootLogger.child({ module: 'http' });
const schedulerLogger = rootLogger.child({ module: 'scheduler' });
const app = createApp({ config, logger: appLogger });

scheduleNightlyClose({ config, logger: schedulerLogger });

app.listen(PORT, () => {
  rootLogger.info(
    { event: 'server_listening', port: PORT, apiVersions: ['v1', 'legacy'] },
    'server_listening',
  );
});
