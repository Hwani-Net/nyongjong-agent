import { analyzeGoal } from '../src/workflow/understand.js';
import { loadConfig } from '../src/core/config.js';
import { setLogLevel } from '../src/utils/logger.js';

const config = loadConfig();
setLogLevel(config.LOG_LEVEL);

async function run() {
  const result = await analyzeGoal({ goal: '새로운 목표' });
  console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);
