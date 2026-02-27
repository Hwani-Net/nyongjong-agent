// MCP Server — exposes agent capabilities as MCP tools for Antigravity
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ObsidianStore } from './core/obsidian-store.js';
import { TaskManager } from './core/task-manager.js';
import { ToolRegistry } from './core/tool-registry.js';
import { recommendModel, listModels, type TaskType, type Complexity } from './core/model-selector.js';
import { type AppConfig } from './core/config.js';
import { PersonaLoader } from './personas/persona-loader.js';
import { PersonaEngine } from './personas/persona-engine.js';
import { PersonaSimulator } from './personas/persona-simulator.js';
import { analyzeGoal, detectAmbiguities, generateOptions, formatAnalysisForPRD } from './workflow/understand.js';
import { runBusinessGate, formatBusinessGateReport, shouldRunBusinessGate } from './workflow/business-gate.js';
import { runPRDElicitation } from './workflow/prd-elicitation.js';
import { classifyFeedback, formatFeedbackReport } from './workflow/feedback-router.js';
import { GroundingEngine } from './grounding/grounding-engine.js';
import { CycleRunner } from './workflow/cycle-runner.js';
import { ShellRunner } from './execution/shell-runner.js';
import { createLogger } from './utils/logger.js';
import { recordGateDecision, setLastGate, setLastPRD } from './core/shared-state.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const log = createLogger('mcp-server');

// Resolve project root from import.meta.url — NOT process.cwd()
// This prevents CWD-dependent bugs when launched from Antigravity/VS Code
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

export interface McpServerOptions {
  config: AppConfig;
}

/**
 * Create and configure the MCP server with all agent tools.
 * Tools are wrapped with a registry check — disabled tools
 * return a clear message instead of executing.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const { config } = options;

  const server = new McpServer({
    name: 'nongjong-agent',
    version: '0.4.0',
  });

  // ─── Tool Registry (runtime toggle) ───
  const registry = new ToolRegistry();

  // Register all tools with groups
  // Group: "core" — always-on foundation
  registry.register('agent_status', 'core', 'Agent server status');
  registry.register('tool_toggle', 'core', 'Toggle tools on/off (meta)');
  registry.register('tool_status', 'core', 'Show tool registry state (meta)');

  // Group: "task" — task management
  registry.register('task_list', 'task', 'List task queue');
  registry.register('task_create', 'task', 'Create new task');

  // Group: "model" — model selection
  registry.register('recommend_model', 'model', 'Recommend optimal AI model');
  registry.register('list_models', 'model', 'List all available models');

  // Group: "memory" — Obsidian vault interaction
  registry.register('memory_search', 'memory', 'Search agent memory');
  registry.register('memory_write', 'memory', 'Write to agent memory');

  // Group: "persona" — persona system
  registry.register('persona_list', 'persona', 'List personas');
  registry.register('persona_consult', 'persona', 'Consult personas');
  registry.register('persona_create', 'persona', 'Create a new persona');
  registry.register('persona_update', 'persona', 'Update an existing persona');
  registry.register('persona_delete', 'persona', 'Delete a persona');

  // Group: "workflow" — AI circular workflow
  registry.register('analyze_goal', 'workflow', 'Analyze user goal');
  registry.register('run_cycle', 'workflow', 'Run full AI workflow cycle');
  registry.register('business_gate', 'workflow', 'Gate 0: Business viability check');
  registry.register('prd_elicit', 'workflow', 'Gate 1: PRD self-healing loop');
  registry.register('feedback_classify', 'workflow', 'Classify human feedback for rollback');

  // Group: "advisory" — Ollama / LLM
  registry.register('ollama_health', 'advisory', 'Check Ollama status');

  // Group: "grounding" — data grounding
  registry.register('ground_check', 'grounding', 'Detect and verify factual claims');

  // Initialize core modules
  const store = new ObsidianStore({ vaultPath: config.OBSIDIAN_VAULT_PATH });
  const taskManager = new TaskManager({
    store,
    agentDataDir: config.AGENT_DATA_DIR,
  });

  // Initialize persona modules
  const personaLoader = new PersonaLoader({
    store,
    personasDir: `${config.AGENT_DATA_DIR}/personas`,
  });
  const personaEngine = new PersonaEngine(personaLoader);
  const personaSimulator = new PersonaSimulator({
    ollamaUrl: config.OLLAMA_URL,
  });

  // Initialize grounding (design doc Section 6: adapters inside engine)
  const groundingEngine = new GroundingEngine();

  // Initialize workflow
  const shellRunner = new ShellRunner();
  // NOTE: cycleRunner is created per-call in run_cycle tool to ensure:
  //   1. Fresh state isolation between runs
  //   2. personaEngine + personaSimulator are injected for Gate 0/1
  // The module-level instance is kept for type reference only.
  const _cycleRunnerDefaults = {
    maxRetries: 3,
    projectRoot: PROJECT_ROOT,
    runShell: (cmd: string, cwd: string) => shellRunner.run(cmd, cwd),
  };

  // ═══════════════════════════════════════
  // META TOOLS (always enabled, group: core)
  // ═══════════════════════════════════════

  // ─── Tool: agent_status ───
  server.tool(
    'agent_status',
    'Check the current status of the 뇽죵이 agent server',
    {},
    async () => {
      log.debug('agent_status called');
      const activeTask = await taskManager.getActiveTask();
      const summary = registry.getSummary();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'running',
            version: '0.4.0',
            activeTask: activeTask ? { id: activeTask.id, title: activeTask.title } : null,
            obsidianVault: config.OBSIDIAN_VAULT_PATH,
            ollamaUrl: config.OLLAMA_URL,
            toolGroups: summary,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: tool_toggle ───
  server.tool(
    'tool_toggle',
    'Toggle MCP tools on/off at runtime. Use name for single tool, group for batch toggle.',
    {
      name: z.string().optional().describe('Tool name to toggle (e.g., "ground_check")'),
      group: z.string().optional().describe('Group name to toggle all tools in group (e.g., "persona", "grounding")'),
      enabled: z.boolean().describe('true = enable, false = disable'),
    },
    async (params) => {
      log.info('tool_toggle called', params);

      if (params.name) {
        const success = registry.toggle(params.name, params.enabled);
        return {
          content: [{
            type: 'text' as const,
            text: success
              ? `✅ Tool "${params.name}" ${params.enabled ? 'ENABLED' : 'DISABLED'}`
              : `❌ Tool "${params.name}" not found in registry`,
          }],
        };
      }

      if (params.group) {
        const affected = registry.toggleGroup(params.group, params.enabled);
        return {
          content: [{
            type: 'text' as const,
            text: affected.length > 0
              ? `✅ Group "${params.group}" ${params.enabled ? 'ENABLED' : 'DISABLED'}: ${affected.join(', ')}`
              : `❌ No tools found in group "${params.group}"`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: '❌ Specify either "name" or "group" to toggle.',
        }],
      };
    },
  );

  // ─── Tool: tool_status ───
  server.tool(
    'tool_status',
    'Show the current state of all registered tools (enabled/disabled)',
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(registry.getSummary(), null, 2),
        }],
      };
    },
  );

  // ═══════════════════════════════════════
  // TOGGLEABLE TOOLS (check registry before executing)
  // ═══════════════════════════════════════

  // ─── Tool: task_list ───
  server.tool(
    'task_list',
    'List all tasks in the agent queue',
    {},
    async () => {
      if (!registry.isEnabled('task_list')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('task_list') }] };
      }
      log.debug('task_list called');
      const tasks = await taskManager.getQueue();
      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  );

  // ─── Tool: task_create ───
  server.tool(
    'task_create',
    'Create a new task in the agent queue',
    {
      title: z.string().describe('Task title'),
      description: z.string().describe('Task description'),
      priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal').describe('Task priority'),
      tags: z.array(z.string()).optional().describe('Optional tags'),
    },
    async (params) => {
      if (!registry.isEnabled('task_create')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('task_create') }] };
      }
      log.info('task_create called', params);
      const task = await taskManager.createTask(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ─── Tool: recommend_model ───
  server.tool(
    'recommend_model',
    'Recommend the optimal AI model for a given task type and complexity',
    {
      taskType: z.enum(['architecture', 'implementation', 'debugging', 'refactoring', 'simple', 'documentation', 'strategy']).describe('Type of task'),
      complexity: z.enum(['low', 'medium', 'high', 'critical']).describe('Task complexity'),
      budgetConstrained: z.boolean().optional().describe('Prefer cheaper models'),
    },
    async (params) => {
      if (!registry.isEnabled('recommend_model')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('recommend_model') }] };
      }
      log.debug('recommend_model called', params);
      const recommendation = recommendModel({
        taskType: params.taskType as TaskType,
        complexity: params.complexity as Complexity,
        budgetConstrained: params.budgetConstrained,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(recommendation, null, 2) }] };
    },
  );

  // ─── Tool: list_models ───
  server.tool(
    'list_models',
    'List all available AI models with their cost tiers',
    {},
    async () => {
      if (!registry.isEnabled('list_models')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('list_models') }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(listModels(), null, 2) }] };
    },
  );

  // ─── Tool: memory_search ───
  server.tool(
    'memory_search',
    'Search the agent memory (Obsidian vault) for notes matching a query',
    {
      query: z.string().describe('Search query text'),
      directory: z.string().optional().describe('Vault-relative directory to search in (defaults to agent data dir)'),
    },
    async (params) => {
      if (!registry.isEnabled('memory_search')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('memory_search') }] };
      }
      log.debug('memory_search called', params);
      const dir = params.directory || config.AGENT_DATA_DIR;
      const results = await store.searchNotes(dir, params.query);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            results.map((r) => ({ path: r.path, frontmatter: r.frontmatter, preview: r.content.slice(0, 200) })),
            null, 2,
          ),
        }],
      };
    },
  );

  // ─── Tool: memory_write ───
  server.tool(
    'memory_write',
    'Write a note to the agent memory (Obsidian vault)',
    {
      path: z.string().describe('Vault-relative file path (e.g., "뇽죵이Agent/memory/my-note.md")'),
      content: z.string().describe('Markdown content to write'),
      frontmatter: z.record(z.unknown()).optional().describe('Optional YAML frontmatter as key-value pairs'),
    },
    async (params) => {
      if (!registry.isEnabled('memory_write')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('memory_write') }] };
      }
      log.info('memory_write called', { path: params.path });
      await store.writeNote(params.path, params.content, params.frontmatter);
      return { content: [{ type: 'text' as const, text: `✅ Note written to ${params.path}` }] };
    },
  );

  // ─── Tool: persona_list ───
  server.tool(
    'persona_list',
    'List all available personas grouped by category',
    {},
    async () => {
      if (!registry.isEnabled('persona_list')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_list') }] };
      }
      log.debug('persona_list called');
      const summary = await personaEngine.getPersonaSummary();
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  // ─── Tool: persona_consult ───
  server.tool(
    'persona_consult',
    'Consult personas for a given topic at a specific workflow stage',
    {
      stage: z.enum(['understand', 'prototype', 'validate', 'evolve', 'report']).describe('Current workflow stage'),
      topic: z.string().describe('Topic to consult about'),
      maxPersonas: z.number().optional().describe('Max number of personas to consult (default: 3)'),
    },
    async (params) => {
      if (!registry.isEnabled('persona_consult')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_consult') }] };
      }
      log.info('persona_consult called', params);
      const plan = await personaEngine.createConsultationPlan({
        stage: params.stage,
        topic: params.topic,
        maxPersonas: params.maxPersonas,
      });

      if (plan.consultations.length > 0) {
        const health = await personaSimulator.healthCheck();
        if (health.available) {
          const results = await personaSimulator.runPlan(plan);
          return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              note: 'Ollama not available — returning prompts for manual review',
              consultations: plan.consultations.map((c) => ({
                persona: c.persona.name,
                prompt: c.prompt,
              })),
            }, null, 2),
          }],
        };
      }

      return { content: [{ type: 'text' as const, text: 'No personas found for this stage/topic.' }] };
    },
  );

  // ─── Tool: persona_create ───
  server.tool(
    'persona_create',
    'Create a new persona definition in the vault',
    {
      id: z.string().describe('Unique persona ID (e.g., "devops-engineer")'),
      name: z.string().describe('Display name (e.g., "DevOps 엔지니어")'),
      category: z.enum(['customer', 'philosopher', 'business', 'engineer', 'regulatory', 'temporal']).describe('Persona category'),
      activatedAt: z.array(z.enum(['understand', 'prototype', 'validate', 'evolve', 'report'])).describe('Workflow stages to activate'),
      priority: z.enum(['low', 'normal', 'high', 'critical']).optional().describe('Priority (default: normal)'),
      content: z.string().describe('Full persona description text'),
    },
    async (params) => {
      if (!registry.isEnabled('persona_create')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_create') }] };
      }
      log.info('persona_create called', { id: params.id });
      await personaLoader.createPersona({
        id: params.id,
        name: params.name,
        category: params.category,
        era: new Date().getFullYear().toString(),
        activatedAt: params.activatedAt,
        priority: params.priority || 'normal',
        content: params.content,
      });
      return { content: [{ type: 'text' as const, text: `Persona created: ${params.id} (${params.name})` }] };
    },
  );

  // ─── Tool: persona_update ───
  server.tool(
    'persona_update',
    'Update an existing persona definition',
    {
      id: z.string().describe('Persona ID to update'),
      name: z.string().optional().describe('New display name'),
      category: z.enum(['customer', 'philosopher', 'business', 'engineer', 'regulatory', 'temporal']).optional().describe('New category'),
      activatedAt: z.array(z.enum(['understand', 'prototype', 'validate', 'evolve', 'report'])).optional().describe('New activation stages'),
      priority: z.enum(['low', 'normal', 'high', 'critical']).optional().describe('New priority'),
      content: z.string().optional().describe('New description text'),
    },
    async (params) => {
      if (!registry.isEnabled('persona_update')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_update') }] };
      }
      log.info('persona_update called', { id: params.id });
      const { id, ...updates } = params;
      const success = await personaLoader.updatePersona(id, updates);
      if (success) {
        return { content: [{ type: 'text' as const, text: `Persona updated: ${id}` }] };
      }
      return { content: [{ type: 'text' as const, text: `Persona not found: ${id}` }] };
    },
  );

  // ─── Tool: persona_delete ───
  server.tool(
    'persona_delete',
    'Delete a persona from the vault',
    {
      id: z.string().describe('Persona ID to delete'),
    },
    async (params) => {
      if (!registry.isEnabled('persona_delete')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_delete') }] };
      }
      log.info('persona_delete called', { id: params.id });
      const deleted = await personaLoader.deletePersona(params.id);
      if (deleted) {
        return { content: [{ type: 'text' as const, text: `Persona deleted: ${params.id}` }] };
      }
      return { content: [{ type: 'text' as const, text: `Persona not found: ${params.id}` }] };
    },
  );

  // ─── Tool: analyze_goal ───
  server.tool(
    'analyze_goal',
    'Analyze a user goal and extract task type, complexity, and requirements',
    {
      goal: z.string().describe('User goal text'),
      projectContext: z.string().optional().describe('Existing project context'),
    },
    async (params) => {
      if (!registry.isEnabled('analyze_goal')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('analyze_goal') }] };
      }
      log.info('analyze_goal called', { goalLength: params.goal.length });
      const result = analyzeGoal({ goal: params.goal, projectContext: params.projectContext });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ─── Tool: ollama_health ───
  server.tool(
    'ollama_health',
    'Check if Ollama (local LLM) is running and list available models',
    {},
    async () => {
      if (!registry.isEnabled('ollama_health')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('ollama_health') }] };
      }
      const health = await personaSimulator.healthCheck();
      return { content: [{ type: 'text' as const, text: JSON.stringify(health, null, 2) }] };
    },
  );

  // ─── Tool: ground_check ───
  server.tool(
    'ground_check',
    'Detect factual claims in text and verify them via external APIs',
    {
      text: z.string().describe('Text to analyze for factual claims'),
      verifyApi: z.boolean().optional().describe('If true, also call APIs to verify claims (default: false — quick check only)'),
    },
    async (params) => {
      if (!registry.isEnabled('ground_check')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('ground_check') }] };
      }
      log.info('ground_check called', { textLength: params.text.length });
      if (params.verifyApi) {
        const result = await groundingEngine.ground(params.text);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      }
      const analysis = groundingEngine.quickCheck(params.text);
      return { content: [{ type: 'text' as const, text: JSON.stringify(analysis, null, 2) }] };
    },
  );

  // ─── Tool: business_gate ───
  server.tool(
    'business_gate',
    'Gate 0: Business viability check — business personas review goal before PRD generation',
    {
      goal: z.string().describe('The goal to evaluate for business viability'),
      groundingData: z.string().optional().describe('Optional market data from grounding engine'),
    },
    async (params) => {
      if (!registry.isEnabled('business_gate')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('business_gate') }] };
      }
      log.info('business_gate called', { goal: params.goal.slice(0, 80) });
      const analysis = analyzeGoal({ goal: params.goal });

      // Auto-inject grounding data if not provided
      let groundingData = params.groundingData;
      if (!groundingData) {
        try {
          const groundingResult = await groundingEngine.ground(params.goal);
          if (groundingResult.status !== 'no_claims' && groundingResult.verifications.length > 0) {
            groundingData = groundingResult.summary + '\n' +
              groundingResult.verifications
                .filter(v => v.verified)
                .map(v => `- [${v.claim.type}] ${v.claim.text}: ${v.apiResult.data.slice(0, 100)}`)
                .join('\n');
            log.info('Auto-grounding injected', { claims: groundingResult.verifications.length });
          }
        } catch (err) {
          log.debug('Auto-grounding skipped (error)', err);
        }
      }

      // Check if gate should run at all
      const gateNeed = shouldRunBusinessGate(
        params.goal,
        analysis.analysis.taskType,
        analysis.analysis.complexity,
      );

      if (gateNeed.need === 'SKIP') {
        const skipReport = `## ⏭️ 사업성 검토 건너뜀\n\n**사유:** ${gateNeed.reason}\n\n→ Gate 1(PRD)으로 바로 진행합니다.`;
        return { content: [{ type: 'text' as const, text: skipReport }] };
      }

      if (gateNeed.need === 'ASK_HUMAN') {
        const askReport = `## ❓ 사업성 검토 필요 여부 확인\n\n**사유:** ${gateNeed.reason}\n\n이 작업에 사업성 검토가 필요한가요?\n- **"예"** → 사업성 검토 진행\n- **"아니오"** → PRD로 바로 진행`;
        return { content: [{ type: 'text' as const, text: askReport }] };
      }

      // REQUIRED — check Ollama availability, pass simulator if available
      const ollamaOk = await personaSimulator.healthCheck().then(h => h.available).catch(() => false);
      const result = await runBusinessGate(
        {
          goal: params.goal,
          analysis,
          groundingData: params.groundingData,
          simulator: ollamaOk ? personaSimulator : undefined,
        },
        personaEngine,
      );

      // ── #6 Stage-Gate → Dashboard 고도화 ──
      recordGateDecision({
        goal: params.goal,
        verdict: result.verdict as 'PASS' | 'PIVOT' | 'FAIL',
        taskType: analysis.analysis.taskType,
      });
      setLastGate({
        reviews: result.reviews.map(r => ({
          personaId: r.personaId,
          personaName: r.personaName,
          verdict: r.verdict,
          feedback: r.feedback,
        })),
        hasGrounding: !!groundingData,
        goal: params.goal,
        verdict: result.verdict,
        ts: Date.now(),
      });

      const modeTag = ollamaOk ? '> 🤖 **LLM 모드** (Ollama 연동)\n\n' : '> 🧪 **휴리스틱 모드** (Ollama 미연동)\n\n';
      const report = formatBusinessGateReport(result);
      return { content: [{ type: 'text' as const, text: modeTag + report }] };
    },
  );

  // ─── Tool: prd_elicit ───
  server.tool(
    'prd_elicit',
    'Gate 1: PRD self-healing loop — customer personas review and refine PRD until satisfied',
    {
      goal: z.string().describe('The goal to generate PRD for'),
      projectContext: z.string().optional().describe('Existing project context'),
      maxRounds: z.number().optional().describe('Max refinement rounds (default: 3)'),
    },
    async (params) => {
      if (!registry.isEnabled('prd_elicit')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('prd_elicit') }] };
      }
      log.info('prd_elicit called', { goal: params.goal.slice(0, 80) });
      const analysis = analyzeGoal({ goal: params.goal, projectContext: params.projectContext });
      const ollamaOk2 = await personaSimulator.healthCheck().then(h => h.available).catch(() => false);
      const result = await runPRDElicitation(
        {
          goal: params.goal,
          analysis,
          projectContext: params.projectContext,
          maxRounds: params.maxRounds,
          simulator: ollamaOk2 ? personaSimulator : undefined,
        },
        personaEngine,
      );

      // ── #6/8 PRD 결과 → Dashboard LastPRD ──
      setLastPRD({
        version: result.prd.version,
        verdicts: result.verdicts.map((v, i) => ({
          round: i + 1,
          status: v.verdict,
          issues: v.blockers,
        })),
        rounds: result.rounds,
        goal: params.goal,
        ts: Date.now(),
      });

      return { content: [{ type: 'text' as const, text: result.report }] };
    },
  );

  // ─── Tool: feedback_classify ───
  server.tool(
    'feedback_classify',
    'Classify human feedback to determine minimum rollback point (gate0/gate1/stitch/evolve)',
    {
      feedback: z.string().describe('Human feedback text to classify'),
    },
    async (params) => {
      if (!registry.isEnabled('feedback_classify')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('feedback_classify') }] };
      }
      log.info('feedback_classify called', { feedbackLen: params.feedback.length });
      const classification = classifyFeedback(params.feedback);
      const report = formatFeedbackReport(classification);
      return { content: [{ type: 'text' as const, text: report }] };
    },
  );

  // ─── Tool: run_cycle ───
  server.tool(
    'run_cycle',
    'Run the full AI circular workflow (Understand→Prototype→Validate→Evolve→Report) for a goal',
    {
      goal: z.string().describe('The goal to execute'),
      projectContext: z.string().optional().describe('Existing project context'),
    },
    async (params) => {
      if (!registry.isEnabled('run_cycle')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('run_cycle') }] };
      }
      log.info('run_cycle called', { goal: params.goal.slice(0, 80) });

      // ── V-1 Fix: inject personaEngine + personaSimulator into CycleRunner ──
      // Creating a fresh CycleRunner per call ensures:
      //   1. Gate 0 (business viability) actually runs for new features
      //   2. Gate 1 (PRD elicitation) runs with persona feedback
      //   3. Gate decisions are recorded in shared-state → Dashboard
      const runner = new CycleRunner({
        ..._cycleRunnerDefaults,
        personaEngine,
        personaSimulator,
        onGateDecision: (goal, verdict) => {
          // Final cycle verdict → Gate History (covers SKIP path via run_cycle)
          const analysis = analyzeGoal({ goal });
          recordGateDecision({
            goal,
            verdict: verdict as 'PASS' | 'FAIL' | 'SKIP' | 'PIVOT',
            taskType: analysis.analysis.taskType,
          });
        },
      });

      const report = await runner.run({ goal: params.goal, projectContext: params.projectContext });
      return { content: [{ type: 'text' as const, text: report.markdown }] };
    },
  );

  const totalTools = registry.getState().length;
  log.info(`MCP Server configured with ${totalTools} tools (runtime toggleable)`);
  return server;
}

/**
 * Start the MCP server with stdio transport.
 */
export async function startMcpServer(config: AppConfig): Promise<void> {
  const server = createMcpServer({ config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('MCP Server started (stdio transport)');
}
