#!/usr/bin/env node
// Entry point — initializes config and starts the MCP server
import './pre-init.js';
import { loadConfig } from './core/config.js';
import { setLogLevel } from './utils/logger.js';
import { createLogger } from './utils/logger.js';
import { startMcpServer } from './mcp-server.js';

const log = createLogger('main');

async function main() {
  try {
    // Load and validate configuration
    const config = loadConfig();
    setLogLevel(config.LOG_LEVEL);

    log.info('뇽죵이 Agent v0.1.0 starting...');
    log.info(`Obsidian Vault: ${config.OBSIDIAN_VAULT_PATH}`);
    log.info(`Ollama URL: ${config.OLLAMA_URL}`);
    log.info(`Transport: ${config.MCP_TRANSPORT}`);

    // Start MCP server
    await startMcpServer(config);
  } catch (error) {
    log.error('Failed to start agent', error);
    process.exit(1);
  }
}

main();
