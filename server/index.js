import { createApp } from './app.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const app = createApp();

app.listen(PORT, () => {
  console.log(
    JSON.stringify({ level: 'info', message: 'server_listening', port: PORT }),
  );
});
