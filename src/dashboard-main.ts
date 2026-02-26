// Dashboard entry point
import { loadConfig } from './core/config.js';
import { setLogLevel } from './utils/logger.js';
import { startDashboard } from './dashboard/server.js';

const config = loadConfig();
setLogLevel(config.LOG_LEVEL);

const port = parseInt(process.env.DASHBOARD_PORT || '3100', 10);
startDashboard({ config, port });
