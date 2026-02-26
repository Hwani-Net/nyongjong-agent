// Agent orchestrator — ties all modules together into a single entry point
import { createLogger } from './utils/logger.js';
import { type AppConfig } from './core/config.js';
import { ObsidianStore } from './core/obsidian-store.js';
import { TaskManager } from './core/task-manager.js';
import { PersonaLoader } from './personas/persona-loader.js';
import { PersonaEngine } from './personas/persona-engine.js';
import { PersonaSimulator } from './personas/persona-simulator.js';
import { GroundingEngine } from './grounding/grounding-engine.js';
import { OllamaClient } from './advisory/ollama-client.js';
import { LlmBenchmark } from './advisory/llm-benchmark.js';
import { CycleRunner } from './workflow/cycle-runner.js';
import { ShellRunner } from './execution/shell-runner.js';
import { TestRunner } from './execution/test-runner.js';
import { GitWorktree } from './execution/git-worktree.js';

const log = createLogger('agent');

export interface AgentModules {
  store: ObsidianStore;
  taskManager: TaskManager;
  personaLoader: PersonaLoader;
  personaEngine: PersonaEngine;
  personaSimulator: PersonaSimulator;
  groundingEngine: GroundingEngine;
  ollamaClient: OllamaClient;
  llmBenchmark: LlmBenchmark;
  cycleRunner: CycleRunner;
  shellRunner: ShellRunner;
  testRunner: TestRunner;
  gitWorktree: GitWorktree;
}

/**
 * Initialize all agent modules from config.
 *
 * Design doc Section 7 — module structure:
 *   core/ → store, taskManager, modelSelector, config
 *   personas/ → personaLoader, personaEngine, personaSimulator
 *   grounding/ → groundingEngine (with adapters/ inside)
 *   advisory/ → ollamaClient, llmBenchmark
 *   execution/ → shellRunner, testRunner, gitWorktree
 *   workflow/ → cycleRunner (understand, prototype, validate, evolve, report)
 */
export function initializeAgent(config: AppConfig): AgentModules {
  log.info('━━━ Initializing 뇽죵이 Agent ━━━');

  // Core
  const store = new ObsidianStore({ vaultPath: config.OBSIDIAN_VAULT_PATH });
  const taskManager = new TaskManager({ store, agentDataDir: config.AGENT_DATA_DIR });

  // Personas
  const personaLoader = new PersonaLoader({ store, personasDir: `${config.AGENT_DATA_DIR}/personas` });
  const personaEngine = new PersonaEngine(personaLoader);
  const personaSimulator = new PersonaSimulator({ ollamaUrl: config.OLLAMA_URL });

  // Grounding (design doc Section 6: adapters initialized inside engine)
  const groundingEngine = new GroundingEngine();

  // Advisory (design doc Section 7: advisory/)
  const ollamaClient = new OllamaClient({ baseUrl: config.OLLAMA_URL });
  const llmBenchmark = new LlmBenchmark({ ollamaClient });

  // Execution
  const shellRunner = new ShellRunner();
  const testRunner = new TestRunner({ shellRunner, projectRoot: process.cwd() });
  const gitWorktree = new GitWorktree({ repoPath: process.cwd(), shellRunner });

  // Workflow
  const cycleRunner = new CycleRunner({
    maxRetries: 3,
    projectRoot: process.cwd(),
    runShell: (cmd, cwd) => shellRunner.run(cmd, cwd),
  });

  log.info('━━━ All modules initialized ━━━');

  return {
    store,
    taskManager,
    personaLoader,
    personaEngine,
    personaSimulator,
    groundingEngine,
    ollamaClient,
    llmBenchmark,
    cycleRunner,
    shellRunner,
    testRunner,
    gitWorktree,
  };
}

/**
 * Get a status summary of all agent modules.
 */
export async function getAgentStatus(modules: AgentModules, config: AppConfig): Promise<Record<string, unknown>> {
  const ollamaHealth = await modules.ollamaClient.healthCheck();
  const activeTask = await modules.taskManager.getActiveTask();
  const adapterStatus = modules.groundingEngine.getAdapterStatus();

  return {
    version: '0.3.0',
    status: 'running',
    modules: {
      obsidian: { connected: true, vault: config.OBSIDIAN_VAULT_PATH },
      ollama: ollamaHealth,
      grounding: { adapters: adapterStatus },
      workflow: { status: modules.cycleRunner.getState().status },
    },
    activeTask: activeTask ? { id: activeTask.id, title: activeTask.title } : null,
  };
}
