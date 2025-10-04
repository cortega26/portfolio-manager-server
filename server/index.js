import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { scheduleNightlyClose } from './jobs/scheduler.js';

const config = loadConfig();
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const app = createApp({ config });

scheduleNightlyClose({ config, logger: console });

app.listen(PORT, () => {
  console.log(
    JSON.stringify({ level: 'info', message: 'server_listening', port: PORT }),
  );
});
