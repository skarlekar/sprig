// Starts Sprig: reads config, opens the database, serves HTTP and runs housekeeping daily.
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { buildApp, housekeeping } from './app.js';

let config;
try { config = loadConfig(); }
catch (e) { console.error(e.message); process.exit(1); }

const db = openDb(config);
const app = await buildApp(config, { db });

const runHousekeeping = () => { try { housekeeping(db); } catch (e) { app.log.error(e, 'housekeeping failed'); } };
runHousekeeping();
setInterval(runHousekeeping, 24 * 3_600_000).unref();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => { app.log.info(`${sig} received, shutting down`); await app.close(); db.close(); process.exit(0); });
}

await app.listen({ port: config.port, host: config.host });
app.log.info(`Sprig is running at ${config.publicUrl}${config.devLogin ? ' (local test sign-in is ON)' : ''}`);
