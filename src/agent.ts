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
import { ToolRegistry } from './core/tool-registry.js';
import { getGateHistory, getLastGate, getLastPRD, recordGateDecision } from './core/shared-state.js';
import { analyzeGoal } from './workflow/understand.js';
import { shouldRunBusinessGate, runBusinessGate } from './workflow/business-gate.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const log = createLogger('agent');

// Resolve project root from import.meta.url — NOT process.cwd()
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

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
  toolRegistry: ToolRegistry;
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
  const store = new ObsidianStore({ apiKey: config.OBSIDIAN_API_KEY, apiUrl: config.OBSIDIAN_API_URL });
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
  const testRunner = new TestRunner({ shellRunner, projectRoot: PROJECT_ROOT });
  const gitWorktree = new GitWorktree({ repoPath: PROJECT_ROOT, shellRunner });

  // Workflow (inject personaEngine + personaSimulator + gitWorktree for Gate 0/1 + branch isolation)
  const cycleRunner = new CycleRunner({
    maxRetries: 3,
    projectRoot: PROJECT_ROOT,
    runShell: (cmd: string, cwd: string) => shellRunner.run(cmd, cwd),
    personaEngine,
    personaSimulator,
    gitWorktree,
    onGateDecision: (goal: string, verdict: string) => {
      const analysis = analyzeGoal({ goal });
      recordGateDecision({
        goal,
        verdict: verdict as 'PASS' | 'FAIL' | 'SKIP' | 'PIVOT',
        taskType: analysis.analysis.taskType,
      });
    },
  });

  // Tool Registry — single source of truth for all MCP tools
  const toolRegistry = new ToolRegistry();
  const toolDefs: Array<[string, string, string]> = [
    ['agent_status',       'core',     'Get current agent status'],
    ['tool_toggle',        'core',     'Enable or disable a tool'],
    ['tool_status',        'core',     'List all tool states'],
    ['task_list',          'task',     'List tasks in queue'],
    ['task_create',        'task',     'Create a new task'],
    ['recommend_model',    'model',    'Recommend an AI model'],
    ['list_models',        'model',    'List available models'],
    ['memory_search',      'memory',   'Search Obsidian vault'],
    ['memory_write',       'memory',   'Write to Obsidian vault'],
    ['persona_list',       'persona',  'List all personas'],
    ['persona_consult',    'persona',  'Consult a persona'],
    ['persona_create',     'persona',  'Create a new persona'],
    ['persona_update',     'persona',  'Update a persona'],
    ['persona_delete',     'persona',  'Delete a persona'],
    ['analyze_goal',       'workflow', 'Analyze a goal (understand stage)'],
    ['run_cycle',          'workflow', 'Run full AI workflow cycle'],
    ['ollama_health',      'advisory', 'Check Ollama health'],
    ['ground_check',       'grounding','Detect and verify factual claims'],
    ['business_gate',      'workflow', 'Run business viability gate'],
    ['prd_elicit',         'workflow', 'Elicit PRD requirements'],
    ['feedback_classify',  'workflow', 'Classify and route feedback'],
  ];
  for (const [name, group, desc] of toolDefs) toolRegistry.register(name, group, desc);

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
    toolRegistry,
  };
}

// ── Ollama health 30s TTL cache (avoid HTTP on every SSE tick) ───────────
let _ollamaHealthCache: { result: { available: boolean; models?: string[] }; expiresAt: number } | null = null;

async function cachedOllamaHealth(
  client: { healthCheck: () => Promise<{ available: boolean; models?: string[] }> },
): Promise<{ available: boolean; models?: string[] }> {
  if (_ollamaHealthCache && Date.now() < _ollamaHealthCache.expiresAt) {
    return _ollamaHealthCache.result;
  }
  const result = await client.healthCheck();
  _ollamaHealthCache = { result, expiresAt: Date.now() + 30_000 };
  return result;
}

/**
 * Get a status summary of all agent modules.
 */
export async function getAgentStatus(modules: AgentModules, config: AppConfig): Promise<Record<string, unknown>> {
  const ollamaHealth = await cachedOllamaHealth(modules.ollamaClient);
  const activeTask = await modules.taskManager.getActiveTask();
  const adapterStatus = modules.groundingEngine.getAdapterStatus();
  const taskQueue = await modules.taskManager.getQueue();

  // Persona summary
  let personaSummary: Record<string, string[]> = {};
  try {
    personaSummary = await modules.personaEngine.getPersonaSummary();
  } catch { /* personas may not be loaded yet */ }

  // Read version from package.json (single source of truth)
  let version = '0.5.0';
  try {
    const pkgPath = resolve(fileURLToPath(import.meta.url), '../../../package.json');
    const { readFileSync } = await import('fs');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    if (pkg.version) version = pkg.version;
  } catch { /* fallback to hardcoded */ }

  // ── Dynamic tool list from registry (single source of truth) ──
  const registryState = modules.toolRegistry.getState();
  const registrySummary = modules.toolRegistry.getSummary();

  return {
    version,
    enabledTools: registryState.filter(t => t.enabled).map(t => t.name),
    status: 'running',
    modules: {
      obsidian: { connected: true, apiUrl: config.OBSIDIAN_API_URL },
      ollama: ollamaHealth,
      grounding: { adapters: adapterStatus },
      workflow: { status: modules.cycleRunner.getState().status },
    },
    activeTask: activeTask ? { id: activeTask.id, title: activeTask.title, status: activeTask.status } : null,
    taskQueue: taskQueue.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
    personas: personaSummary,
    toolGroups: registrySummary,
    ollamaStatus: ollamaHealth.available ? 'Connected' : 'Offline',
    ollamaModels: ollamaHealth.models || [],
    obsidianApi: config.OBSIDIAN_API_URL ?? 'Not configured',

    // ── Phase 5: Dashboard 추가 필드 ──
    ollama: { available: ollamaHealth.available, models: ollamaHealth.models || [] },
    envKeys: {
      KOSIS_API_KEY:    !!process.env.KOSIS_API_KEY,
      NAVER_CLIENT_ID:  !!process.env.NAVER_CLIENT_ID,
      // law-kr: 법령정보 공개 API (no key required)
      // app-reviews: Play Store scraping (no key required)
    },
    cache: (() => {
      const gs = modules.groundingEngine.getStats();
      return {
        hitRate: gs.hitRate,              // 0-100%
        fileCount: gs.cacheSize,         // cached result count
        avgLatencyMs: gs.avgLatencyMs,   // average grounding call ms
        uncachedMs: null as number | null,
        invalidations: 0,
      };
    })(),
    tools: registryState.map(t => ({ name: t.name, enabled: t.enabled, group: t.group })),
    gateHistory: getGateHistory(),
    lastGate: getLastGate(),
    lastPRD: getLastPRD(),
  };
}
