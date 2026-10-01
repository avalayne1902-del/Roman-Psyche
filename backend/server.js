import { createApp } from './app.js';

const { app, db } = createApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`PsycheAI listening on port ${port}`);
});
const cleanup = setInterval(
  () =>
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()),
  60 * 60 * 1000,
);
cleanup.unref();
function shutdown() {
  clearInterval(cleanup);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
