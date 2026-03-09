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
import { researchMarket, shouldResearchMarket, extractCategory, formatAsGroundingData } from './grounding/market-research.js';
import { CycleRunner } from './workflow/cycle-runner.js';
import { ShellRunner } from './execution/shell-runner.js';
import { DynamicPersonaGenerator } from './personas/persona-generator.js';
import { selfHealRun, completionLoopRun } from './execution/self-heal.js';
import { runCICDGate, formatCICDGateReport } from './execution/cicd-gate.js';
import { collectFeedback, formatFeedbackPrompt } from './workflow/feedback-collector.js';
import { generateIdeatePlan } from './stitch/stitch-ideate.js';
import { extractDesignTokens } from './stitch/stitch-design-system.js';
import { checkStitchForum } from './stitch/stitch-forum.js';
import { createLogger } from './utils/logger.js';
import { recordGateDecision, setLastGate, setLastPRD } from './core/shared-state.js';
import { SkillLifecycleManager, parseFrontmatter } from './core/skill-lifecycle.js';
import { SkillBenchmark } from './core/skill-benchmark.js';
import { LLMRouter, COUNCIL_PRESET, type CouncilRole } from './core/llm-router.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const log = createLogger('mcp-server');

// Resolve project root from import.meta.url — NOT process.cwd()
// This prevents CWD-dependent bugs when launched from Antigravity/VS Code
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

// Dynamic version from package.json (never hardcode)
const AGENT_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
})();

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
    version: AGENT_VERSION,
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
  registry.register('persona_generate', 'persona', 'Generate dynamic personas using Ollama LLM');

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
  registry.register('market_research', 'grounding', 'Research market competitors for a category');

  // Group: "critic" — rule compliance monitoring (AgentPRM-based)
  registry.register('critic_check', 'critic', 'Check rule compliance via Think/Critique/Score');

  // Group: "execution" — direct shell execution
  registry.register('shell_run', 'execution', 'Run a shell command and return the output');

  // Group: "failsafe" — Phase 3 fail-safe features
  registry.register('self_heal', 'failsafe', 'Auto-retry failed builds/tests with error analysis');
  registry.register('completion_loop', 'failsafe', 'Ralph-style completion loop with user-defined iterations');
  registry.register('cicd_gate', 'failsafe', 'Pre-push quality gate (lint + build + test)');
  registry.register('feedback_collect', 'failsafe', 'Collect user satisfaction feedback');

  // Group: "stitch" — Stitch design orchestration
  registry.register('stitch_ideate', 'stitch', 'Generate multi-prompt design comparison plans');
  registry.register('stitch_design_system_extract', 'stitch', 'Extract design tokens from Stitch HTML');
  registry.register('stitch_forum_check', 'stitch', 'Check Stitch forum for new posts via RSS');

  // Group: "lifecycle" — Skill lifecycle management (Skills 2.0)
  registry.register('skill_audit', 'lifecycle', 'Scan skills and generate lifecycle audit report');
  registry.register('skill_benchmark', 'lifecycle', 'A/B benchmark comparison for skill effectiveness');

  // Group: "review" — External LLM review (Council 5인 + 팀장 통합)
  registry.register('external_review', 'review', 'External LLM review: council(5인) | team_lead(1~2인) | custom');

  // Initialize core modules
  const store = new ObsidianStore({ apiKey: config.OBSIDIAN_API_KEY, apiUrl: config.OBSIDIAN_API_URL });
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
            version: AGENT_VERSION,
            activeTask: activeTask ? { id: activeTask.id, title: activeTask.title } : null,
            obsidianApi: config.OBSIDIAN_API_URL,
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
      taskType: z.string().optional().describe('Task type for Role Card situation rules'),
    },
    async (params) => {
      if (!registry.isEnabled('persona_consult')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_consult') }] };
      }
      log.info('persona_consult called', params);

      // ── Layer 1: Domain template detection (keyword-based, instant) ──
      const { detectDomainPersonas } = await import('./personas/persona-templates.js');
      const domainPersonas = detectDomainPersonas(params.topic);
      if (domainPersonas.length > 0) {
        log.info(`Domain templates detected: ${domainPersonas.map(p => p.id).join(', ')}`);
      }

      // ── Layer 2: LLM dynamic persona generation (project-specific) ──
      let dynamicPersonas: import('./personas/persona-templates.js').PersonaTemplate[] = [];
      try {
        const { DynamicPersonaGenerator } = await import('./personas/persona-generator.js');
        const generator = new DynamicPersonaGenerator();
        const health = await personaSimulator.healthCheck();
        if (health.available) {
          const existingIds = domainPersonas.map(p => p.id);
          dynamicPersonas = await generator.generate({
            goal: params.topic,
            count: Math.min(params.maxPersonas || 3, 3), // At most 3 dynamic
            existingPersonaIds: existingIds,
          });
          log.info(`Dynamic personas generated: ${dynamicPersonas.map(p => p.id).join(', ')}`);
        }
      } catch (e) {
        log.warn('Dynamic persona generation skipped', { error: String(e) });
      }

      // ── Merge: templates + dynamic → suggestedPersonas ──
      const allSuggested = [...domainPersonas, ...dynamicPersonas];

      const plan = await personaEngine.createConsultationPlan({
        stage: params.stage,
        topic: params.topic,
        maxPersonas: params.maxPersonas,
        suggestedPersonas: allSuggested,
        autoCreate: true,
        taskType: params.taskType,
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
      category: z.enum(['customer', 'philosopher', 'business', 'engineer', 'regulatory', 'temporal', 'designer']).describe('Persona category'),
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
      category: z.enum(['customer', 'philosopher', 'business', 'engineer', 'regulatory', 'temporal', 'designer']).optional().describe('New category'),
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

  // ─── Tool: market_research ───
  server.tool(
    'market_research',
    'Proactive market research — discover competitors and assess market for new projects',
    {
      category: z.string().describe('App/service category (e.g., "가계부", "낚시", "법률 상담")'),
      platform: z.enum(['android', 'ios', 'web']).optional().default('android').describe('Target platform'),
      goal: z.string().optional().describe('Original goal text for context'),
    },
    async (params) => {
      if (!registry.isEnabled('market_research')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('market_research') }] };
      }
      log.info('market_research called', { category: params.category, platform: params.platform });

      const result = await researchMarket(params.category, params.platform, params.goal || '');
      const formatted = formatAsGroundingData(result);

      return { content: [{ type: 'text' as const, text: formatted }] };
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
      skipGates: z.boolean().optional().describe('Skip Gate 0 (business) and Gate 1 (PRD) — use for bug fixes, refactoring'),
      forceGates: z.boolean().optional().describe('Force Gate 0 + Gate 1 even if complexity is low — always use true for /자율 (new project MVP)'),
    },
    async (params) => {
      if (!registry.isEnabled('run_cycle')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('run_cycle') }] };
      }
      log.info('run_cycle called', { goal: params.goal.slice(0, 80), skipGates: params.skipGates, forceGates: params.forceGates });

      // ── V-1 Fix: inject personaEngine + personaSimulator into CycleRunner ──
      // Creating a fresh CycleRunner per call ensures:
      //   1. Gate 0 (business viability) actually runs for new features
      //   2. Gate 1 (PRD elicitation) runs with persona feedback
      //   3. Gate decisions are recorded in shared-state → Dashboard
      const runner = new CycleRunner({
        ..._cycleRunnerDefaults,
        personaEngine,
        personaSimulator,
        obsidianStore: store,
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

      const report = await runner.run({
        goal: params.goal,
        projectContext: params.projectContext,
        skipGates: params.skipGates,
        forceGates: params.forceGates,
      });
      return { content: [{ type: 'text' as const, text: report.markdown }] };
    },
  );

  // ─── Tool: shell_run ───
  server.tool(
    'shell_run',
    'Run a shell command and return the output',
    {
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().describe('Working directory'),
      timeoutMs: z.number().optional().describe('Timeout in milliseconds (default: 60000)'),
    },
    async (params) => {
      if (!registry.isEnabled('shell_run')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('shell_run') }] };
      }
      log.info('shell_run called', { command: params.command.slice(0, 100), cwd: params.cwd });
      const result = await shellRunner.run(params.command, params.cwd, params.timeoutMs);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            durationMs: result.durationMs,
            success: result.exitCode === 0,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: persona_generate ───
  server.tool(
    'persona_generate',
    'Generate dynamic personas for a project goal using local Ollama LLM',
    {
      goal: z.string().describe('Project goal/description to generate personas for'),
      count: z.number().optional().describe('Number of personas to generate (default: 3)'),
    },
    async (params) => {
      if (!registry.isEnabled('persona_generate')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('persona_generate') }] };
      }
      log.info('persona_generate called', { goal: params.goal.slice(0, 80), count: params.count });

      const generator = new DynamicPersonaGenerator(config.OLLAMA_URL);
      const templates = await generator.generate({
        goal: params.goal,
        count: params.count || 3,
      });

      if (templates.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️ Persona generation failed — Ollama may not be running. Check ollama_health.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(templates.map(t => ({
            id: t.id,
            name: t.name,
            category: t.category,
            activatedAt: t.activatedAt,
          })), null, 2),
        }],
      };
    },
  );

  // ─── Tool: critic_check ───
  // AgentPRM-based 3-stage critic: Think → Critique → Score
  // Evaluates rule compliance at each major workflow stage.
  server.tool(
    'critic_check',
    'Evaluate rule compliance at a workflow stage via Think/Critique/Score (AgentPRM pattern). Returns PASS/WARN/BLOCK verdict.',
    {
      stage: z.enum(['design', 'implementation', 'verification', 'reporting'])
        .describe('Current workflow stage being evaluated'),
      action_description: z.string()
        .describe('Describe what you are about to do or just did (be specific and honest)'),
      rules_claimed: z.array(z.string()).optional()
        .describe('List of rules you claim to have followed'),
    },
    async (params) => {
      if (!registry.isEnabled('critic_check')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('critic_check') }] };
      }
      log.info('critic_check called', { stage: params.stage });

      // ── Load constitution ──
      type Principle = {
        id: string; name: string; rule: string;
        check_questions: string[]; stage: string[];
        severity: 'BLOCK' | 'WARN'; common_bypass: string;
      };
      let constitution: Principle[] = [];
      try {
        const { readFileSync: rfs } = await import('fs');
        const yaml = await import('js-yaml');
        const constitutionPath = 'C:/Users/AIcreator/.agent/critic-constitution.yaml';
        const raw = rfs(constitutionPath, 'utf-8');
        const parsed = yaml.load(raw) as { principles: Principle[] };
        constitution = parsed.principles || [];
      } catch (_err) {
        log.warn('critic_check: constitution load failed, using inline fallback');
        constitution = [
          {
            id: 'DESIGN_FIRST', name: 'Design-First 원칙',
            rule: '코드 작성 전 Stitch 디자인 필수',
            check_questions: ['Stitch projectId가 있는가?'],
            stage: ['design'], severity: 'BLOCK',
            common_bypass: 'Stitch 없이 커스텀 CSS로 재구현',
          },
          {
            id: 'FAILURE_REPORT', name: '실패 즉시 보고',
            rule: '실패 발생 시 즉시 notify_user 보고',
            check_questions: ['실패했는가?', 'notify_user가 호출되었는가?'],
            stage: ['implementation', 'verification'], severity: 'BLOCK',
            common_bypass: '조용히 우회',
          },
          {
            id: 'HONEST_SCORING', name: '정직한 자가 채점',
            rule: '위반이 있으면 반드시 감점',
            check_questions: ['위반이 있었는가?', '채점에 반영되었는가?'],
            stage: ['reporting'], severity: 'BLOCK',
            common_bypass: '만점 부여',
          },
          {
            id: 'YEAR_ACCURACY', name: '연도 정확성',
            rule: '현재 연도는 2026년',
            check_questions: ['2024 사용 여부'],
            stage: ['implementation', 'reporting'], severity: 'WARN',
            common_bypass: '2024를 현재로 착각',
          },
        ];
      }

      // ── Filter rules for this stage ──
      const applicable = constitution.filter(p => p.stage.includes(params.stage));

      // ── THINK: analyze potential violations ──
      const action = params.action_description.toLowerCase();
      const thinkLines: string[] = [];
      const violations: Array<{ id: string; name: string; severity: 'BLOCK' | 'WARN'; reason: string }> = [];

      for (const principle of applicable) {
        thinkLines.push(`[${principle.id}] ${principle.rule}`);

        let violated = false;
        let reason = '';

        if (principle.id === 'DESIGN_FIRST' && params.stage === 'design') {
          const isCodeAction = ['코드', 'component', '구현', 'implement', 'tsx', 'css', 'jsx', 'html', 'js', 'ts'].some(k => action.includes(k));
          const hasDesign = ['stitch', '디자인', 'html 추출', 'screen'].some(k => action.includes(k));
          if (isCodeAction && !hasDesign) {
            violated = true;
            reason = 'Stitch 없이 코딩 시작 감지';
          }
        }

        if (principle.id === 'FAILURE_REPORT') {
          const isFailure = ['실패', '오류', 'error', 'fail', 'failed', '안됨', '안 됨'].some(k => action.includes(k));
          const hasReport = ['notify', '보고', '알림', '대표님'].some(k => action.includes(k));
          if (isFailure && !hasReport) {
            violated = true;
            reason = '실패 발생했지만 보고 없이 진행 시도';
          }
        }

        if (principle.id === 'HONEST_SCORING' && params.stage === 'reporting') {
          const hasMaxScore = ['15/15', '만점', '100점', '15점'].some(k => action.includes(k));
          const hasViolation = ['위반', '어겼', 'violation', 'skip', '스킵'].some(k => action.includes(k));
          if (hasMaxScore && !hasViolation) {
            violated = true;
            reason = '위반 언급 없이 만점 채점 시도';
          }
        }

        if (principle.id === 'YEAR_ACCURACY') {
          if (action.includes('2024') && !['과거', '기준', '이전', 'in 2024', 'of 2024'].some(k => action.includes(k))) {
            violated = true;
            reason = '현재 시점에 2024 사용 (현재: 2026)';
          }
        }

        if (!violated) {
          // Bypass pattern heuristic
          const bypassWords = principle.common_bypass.toLowerCase().split(/[\s,./]+/).filter(w => w.length > 2);
          const matchesBypass = bypassWords.some(kw => action.includes(kw));
          const notClaimed = !(params.rules_claimed || []).some(r =>
            r.toLowerCase().includes(principle.id.toLowerCase())
          );
          if (matchesBypass && notClaimed) {
            violated = true;
            reason = `우회 패턴 감지: ${principle.common_bypass}`;
          }
        }

        if (violated) {
          violations.push({ id: principle.id, name: principle.name, severity: principle.severity, reason });
        }
      }

      // ── SCORE & VERDICT ──
      const blockCount = violations.filter(v => v.severity === 'BLOCK').length;
      const warnCount  = violations.filter(v => v.severity === 'WARN').length;

      let score: number;
      let verdict: 'PASS' | 'WARN' | 'BLOCK';

      if (blockCount > 0) {
        score = Math.max(0, 0.5 - blockCount * 0.15);
        verdict = 'BLOCK';
      } else if (warnCount > 0) {
        score = Math.max(0.6, 0.8 - warnCount * 0.07);
        verdict = 'WARN';
      } else {
        score = 1.0;
        verdict = 'PASS';
      }

      // ── CRITIQUE: actionable summary ──
      const critiqueLines = violations.length > 0
        ? violations.map(v => `❌ [${v.severity}] ${v.name}: ${v.reason}`)
        : ['✅ 이 단계에서 위반 패턴이 감지되지 않았습니다.'];

      const result = {
        stage:         params.stage,
        verdict,
        score:         Math.round(score * 100) / 100,
        think:         thinkLines.join('\n'),
        critique:      critiqueLines.join('\n'),
        violated_rules: violations.map(v => v.id),
        action_required: verdict === 'BLOCK'
          ? '🚨 작업 즉시 중단. notify_user로 위반 사항 보고 후 수정하여 재평가 받을 것.'
          : verdict === 'WARN'
          ? '⚠️ 진행 가능하나 walkthrough에 위반 사항 명시 필수.'
          : '✅ 통과. 다음 단계로 진행.',
      };

      // Auto-log to Obsidian if violation
      if (violations.length > 0) {
        try {
          const ts = new Date().toISOString().slice(0, 10);
          const logPath = `뇽죵이Agent/critic-log/${ts}-violations.md`;
          const logContent = [
            `---`,
            `date: ${ts}`,
            `stage: ${params.stage}`,
            `verdict: ${verdict}`,
            `score: ${score}`,
            `---`,
            `# Critic 위반 로그\n`,
            `## 행동 설명\n${params.action_description}\n`,
            `## 위반 사항\n${critiqueLines.join('\n')}\n`,
          ].join('\n');
          await store.writeNote(logPath, logContent, { date: ts, stage: params.stage, verdict });
          log.info('critic_check: violation logged to Obsidian', { path: logPath });
        } catch (logErr) {
          log.warn('critic_check: Obsidian logging failed', logErr as Error);
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ─── Tool: self_heal ───
  server.tool(
    'self_heal',
    'Auto-retry failed builds/tests up to 3 times with error analysis',
    {
      cwd: z.string().describe('Working directory for commands'),
      commands: z.array(z.string()).describe('Commands to execute (e.g., ["npm run build", "npm test"])'),
      maxRetries: z.number().optional().describe('Maximum retry attempts (default: 3)'),
    },
    async (params) => {
      if (!registry.isEnabled('self_heal')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('self_heal') }] };
      }
      log.info('self_heal called', { cwd: params.cwd, commands: params.commands });

      const result = await selfHealRun({
        cwd: params.cwd,
        commands: params.commands,
        maxRetries: params.maxRetries,
      });

      return { content: [{ type: 'text' as const, text: result.summary }] };
    },
  );

  // ─── Tool: completion_loop ───
  server.tool(
    'completion_loop',
    'Ralph-style completion loop — run commands until a completion promise is met, with user-defined max iterations',
    {
      cwd: z.string().describe('Working directory for commands'),
      commands: z.array(z.string()).describe('Commands to execute each iteration (e.g., ["npm run build", "npm test"])'),
      completionCheck: z.string().describe('Command to verify completion (e.g., "npm test")'),
      completionPromise: z.string().describe('Success string to search for in output (e.g., "All tests passing", "passing")'),
      maxIterations: z.number().optional().describe('Max iterations — you decide the number (default: 5)'),
    },
    async (params) => {
      if (!registry.isEnabled('completion_loop')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('completion_loop') }] };
      }
      log.info('completion_loop called', {
        cwd: params.cwd,
        commands: params.commands,
        completionPromise: params.completionPromise,
        maxIterations: params.maxIterations,
      });

      const result = await completionLoopRun({
        cwd: params.cwd,
        commands: params.commands,
        completionCheck: params.completionCheck,
        completionPromise: params.completionPromise,
        maxIterations: params.maxIterations,
      });

      // Return full result as JSON for rich detail, with summary as primary text
      const output = {
        summary: result.summary,
        success: result.success,
        iterations: result.iterations,
        maxIterations: result.maxIterations,
        completionPromise: result.completionPromise,
        earlyExit: result.earlyExit || null,
        attempts: result.attempts.map(a => ({
          iteration: a.iteration,
          commands: a.commandResults.map(c => `${c.command}: exit ${c.exitCode}`),
          promiseMet: a.checkResult.promiseMet,
          errorAnalysis: a.errorAnalysis || null,
        })),
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    },
  );

  // ─── Tool: cicd_gate ───
  server.tool(
    'cicd_gate',
    'Pre-push quality gate — auto-detects and runs lint, build, test checks',
    {
      cwd: z.string().describe('Project working directory'),
      checks: z.array(z.string()).optional().describe('Custom check commands (auto-detected from package.json if omitted)'),
    },
    async (params) => {
      if (!registry.isEnabled('cicd_gate')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('cicd_gate') }] };
      }
      log.info('cicd_gate called', { cwd: params.cwd });

      const result = await runCICDGate({
        cwd: params.cwd,
        checks: params.checks,
      });

      return { content: [{ type: 'text' as const, text: formatCICDGateReport(result) }] };
    },
  );

  // ─── Tool: feedback_collect ───
  server.tool(
    'feedback_collect',
    'Collect user satisfaction feedback and save to Obsidian',
    {
      project: z.string().describe('Project or task name'),
      score: z.number().min(1).max(5).describe('Satisfaction score (1-5)'),
      comment: z.string().optional().describe('Free-form comment'),
      stage: z.string().optional().describe('Workflow stage (default: report)'),
      deliverable: z.string().optional().describe('What was delivered'),
    },
    async (params) => {
      if (!registry.isEnabled('feedback_collect')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('feedback_collect') }] };
      }
      log.info('feedback_collect called', { project: params.project, score: params.score });

      const result = await collectFeedback(
        {
          project: params.project,
          score: params.score,
          comment: params.comment,
          stage: params.stage,
          deliverable: params.deliverable,
        },
        store,
        config.AGENT_DATA_DIR,
      );

      return { content: [{ type: 'text' as const, text: result.message }] };
    },
  );

  // ═══════════════════════════════════════
  // STITCH TOOLS (design orchestration)
  // ═══════════════════════════════════════

  // ─── Tool: stitch_ideate ───
  server.tool(
    'stitch_ideate',
    'Generate multi-prompt design comparison plans for exploring design directions. Returns an execution plan for Antigravity to follow.',
    {
      baseIdea: z.string().describe('Core design concept (e.g., "fishing log mobile app with dark theme")'),
      variantCount: z.number().optional().describe('Number of design variants to generate (1-5, default: 3)'),
      deviceType: z.enum(['MOBILE', 'DESKTOP']).optional().describe('Target device type (default: DESKTOP)'),
      projectTitle: z.string().optional().describe('Custom project title'),
      styleKeywords: z.array(z.string()).optional().describe('Custom style keywords to apply to all variants'),
    },
    async (params) => {
      if (!registry.isEnabled('stitch_ideate')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('stitch_ideate') }] };
      }
      log.info('stitch_ideate called', { baseIdea: params.baseIdea.slice(0, 60) });
      const plan = generateIdeatePlan(params.baseIdea, {
        variantCount: params.variantCount,
        deviceType: params.deviceType,
        projectTitle: params.projectTitle,
        styleKeywords: params.styleKeywords,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(plan, null, 2),
        }],
      };
    },
  );

  // ─── Tool: stitch_design_system_extract ───
  server.tool(
    'stitch_design_system_extract',
    'Extract design tokens (colors, fonts, spacing, shadows) from Stitch-generated HTML and generate DESIGN.md content',
    {
      html: z.string().describe('Raw HTML content from Stitch get_screen or downloaded HTML file'),
      projectName: z.string().optional().describe('Project name for DESIGN.md header (default: "Untitled")'),
    },
    async (params) => {
      if (!registry.isEnabled('stitch_design_system_extract')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('stitch_design_system_extract') }] };
      }
      log.info('stitch_design_system_extract called', { htmlLength: params.html.length });
      const tokens = extractDesignTokens(params.html, params.projectName);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            summary: {
              colorsFound: tokens.colors.length,
              fontsFound: tokens.fonts.length,
              cssVariablesFound: Object.keys(tokens.rawCssVariables).length,
            },
            tokens: {
              colors: tokens.colors,
              fonts: tokens.fonts,
              spacing: tokens.spacing,
              borderRadius: tokens.borderRadius,
              shadows: tokens.shadows,
            },
            designMd: tokens.designMd,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: stitch_forum_check ───
  server.tool(
    'stitch_forum_check',
    'Check Stitch community forum (Discourse RSS) for new posts relevant to our skills',
    {
      lastCheckDate: z.string().optional().describe('ISO date string of last check (e.g., "2026-03-01"). Posts after this date are returned. If omitted, returns all recent posts.'),
    },
    async (params) => {
      if (!registry.isEnabled('stitch_forum_check')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('stitch_forum_check') }] };
      }
      log.info('stitch_forum_check called', { lastCheckDate: params.lastCheckDate });
      const result = await checkStitchForum(params.lastCheckDate);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  // ─── Skill Lifecycle Tools (Skills 2.0) ───
  const skillLifecycle = new SkillLifecycleManager();
  const skillBenchmarkEngine = new SkillBenchmark();

  // ─── Tool: skill_audit ───
  server.tool(
    'skill_audit',
    'Scan installed skills, classify as capability/workflow, and identify retirement candidates',
    {
      skillsDir: z.string().optional().describe('Absolute path to skills directory (default: C:/Users/AIcreator/.agent/skills)'),
      daysThreshold: z.number().optional().describe('Days of inactivity to flag capability skills for retirement (default: 30)'),
    },
    async (params) => {
      if (!registry.isEnabled('skill_audit')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('skill_audit') }] };
      }
      log.info('skill_audit called', params);

      const skillsDir = params.skillsDir || 'C:/Users/AIcreator/.agent/skills';
      const threshold = params.daysThreshold || 30;

      try {
        // Scan skills directory
        const { readdirSync, readFileSync: readFs } = await import('fs');
        const { join } = await import('path');
        const entries = readdirSync(skillsDir, { withFileTypes: true });
        const skillData: Array<{ name: string; description: string; category: 'capability' | 'workflow' }> = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
          try {
            const content = readFs(skillMdPath, 'utf-8');
            const parsed = parseFrontmatter(content);
            skillData.push({
              name: parsed.name || entry.name,
              description: parsed.description,
              category: parsed.category,
            });
          } catch {
            // Skip dirs without SKILL.md
          }
        }

        skillLifecycle.registerSkills(skillData);
        const auditReport = skillLifecycle.generateAuditReport(threshold);

        return { content: [{ type: 'text' as const, text: auditReport.report }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `❌ Skill audit failed: ${String(err)}` }] };
      }
    },
  );

  // ─── Tool: skill_benchmark ───
  server.tool(
    'skill_benchmark',
    'A/B benchmark: compare skill effectiveness with metrics, eval framework, retirement',
    {
      action: z.enum(['start_baseline', 'end_with_skill', 'get_stats', 'summary', 'flush', 'flush_all', 'run_eval', 'scan_evals', 'retire', 'reactivate', 'auto_generate_eval', 'bulk_generate_evals']).describe('Benchmark action'),
      skillName: z.string().optional().describe('Skill name (required for most actions)'),
      sessionId: z.string().optional().describe('Session ID from start_baseline (required for end_with_skill)'),
      tokens: z.number().optional().describe('Token count for this measurement'),
      durationMs: z.number().optional().describe('Duration in milliseconds'),
      success: z.boolean().optional().describe('Whether the task succeeded'),
      autoFlush: z.boolean().optional().describe('Auto-flush to Obsidian after end_with_skill (default: false)'),
      basePath: z.string().optional().describe('Vault base path for flush (default: 뇽죵이Agent/benchmark)'),
    },
    async (params) => {
      if (!registry.isEnabled('skill_benchmark')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('skill_benchmark') }] };
      }
      log.info('skill_benchmark called', params);

      switch (params.action) {
        case 'start_baseline': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for start_baseline' }] };
          }
          const sessionId = skillBenchmarkEngine.startBaseline(
            params.skillName,
            params.tokens || 0,
            params.durationMs || 0,
            params.success ?? true,
          );
          return { content: [{ type: 'text' as const, text: `✅ Baseline recorded. Session ID: ${sessionId}\nNow run the task WITH the skill, then call end_with_skill.` }] };
        }

        case 'end_with_skill': {
          if (!params.sessionId) {
            return { content: [{ type: 'text' as const, text: '❌ sessionId is required for end_with_skill' }] };
          }
          const result = skillBenchmarkEngine.endWithSkill(
            params.sessionId,
            params.tokens || 0,
            params.durationMs || 0,
            params.success ?? true,
          );
          if (!result) {
            return { content: [{ type: 'text' as const, text: '❌ Session not found or already completed' }] };
          }
          // Auto-flush to Obsidian if requested
          if (params.autoFlush) {
            try {
              const flushPath = await skillBenchmarkEngine.flushToObsidian(
                result.skillName,
                store,
                params.basePath,
              );
              return { content: [{ type: 'text' as const, text: result.report + `\n\n✅ **자동 flush 완료**: \`${flushPath}\`` }] };
            } catch (flushErr) {
              return { content: [{ type: 'text' as const, text: result.report + `\n\n⚠️ Auto-flush 실패: ${flushErr instanceof Error ? flushErr.message : String(flushErr)}` }] };
            }
          }
          return { content: [{ type: 'text' as const, text: result.report }] };
        }

        case 'get_stats': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for get_stats' }] };
          }
          const stats = skillBenchmarkEngine.getSkillStats(params.skillName);
          if (!stats) {
            return { content: [{ type: 'text' as const, text: `아직 "${params.skillName}"에 대한 벤치마크 데이터가 없습니다.` }] };
          }
          return { content: [{ type: 'text' as const, text: stats.report }] };
        }

        case 'summary': {
          const summary = skillBenchmarkEngine.generateSummaryReport();
          return { content: [{ type: 'text' as const, text: summary }] };
        }

        case 'flush': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for flush' }] };
          }
          try {
            const flushPath = await skillBenchmarkEngine.flushToObsidian(
              params.skillName,
              store,
              params.basePath,
            );
            return { content: [{ type: 'text' as const, text: `✅ 벤치마크 결과를 Obsidian에 저장했습니다.\n\n📄 경로: \`${flushPath}\`` }] };
          } catch (err) {
            return { content: [{ type: 'text' as const, text: `❌ flush 실패: ${err instanceof Error ? err.message : String(err)}` }] };
          }
        }

        case 'flush_all': {
          try {
            const { paths, summaryPath } = await skillBenchmarkEngine.flushAllToObsidian(
              store,
              params.basePath,
            );
            const pathList = paths.map(p => `- \`${p}\``).join('\n');
            return { content: [{ type: 'text' as const, text: `✅ 전체 벤치마크 flush 완료!\n\n**저장된 스킬 (${paths.length}개):**\n${pathList}\n\n📊 종합 보고서: \`${summaryPath}\`` }] };
          } catch (err) {
            return { content: [{ type: 'text' as const, text: `❌ flush_all 실패: ${err instanceof Error ? err.message : String(err)}` }] };
          }
        }

        case 'run_eval': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for run_eval' }] };
          }
          const { runSkillEvalSuite } = await import('./core/skill-eval.js');
          const evalSummary = await runSkillEvalSuite(params.skillName);
          return { content: [{ type: 'text' as const, text: evalSummary.report }] };
        }

        case 'scan_evals': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for scan_evals' }] };
          }
          const { scanSkillEvals } = await import('./core/skill-eval.js');
          const evals = await scanSkillEvals(params.skillName);
          if (evals.length === 0) {
            return { content: [{ type: 'text' as const, text: `⚠️ "${params.skillName}"에 eval 정의가 없습니다. eval/ 폴더에 YAML 파일을 추가하세요.` }] };
          }
          const evalList = evals.map(e => `- **${e.name}**: ${e.prompt.slice(0, 60)}... (expected: ${e.expectedContains.join(', ')})`).join('\n');
          return { content: [{ type: 'text' as const, text: `## 📋 ${params.skillName} Eval 목록 (${evals.length}개)\n\n${evalList}` }] };
        }

        case 'retire': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for retire' }] };
          }
          const retireResult = await skillLifecycle.retireSkillOnDisk(params.skillName);
          return { content: [{ type: 'text' as const, text: retireResult.message }] };
        }

        case 'reactivate': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for reactivate' }] };
          }
          const reactivateResult = await skillLifecycle.reactivateSkillOnDisk(params.skillName);
          return { content: [{ type: 'text' as const, text: reactivateResult.message }] };
        }

        case 'auto_generate_eval': {
          if (!params.skillName) {
            return { content: [{ type: 'text' as const, text: '❌ skillName is required for auto_generate_eval' }] };
          }
          const { autoGenerateEval } = await import('./core/skill-eval.js');
          const autoResult = await autoGenerateEval(params.skillName);
          if (autoResult.skipped) {
            return { content: [{ type: 'text' as const, text: `⏭️ "${params.skillName}" — 스킵: ${autoResult.reason}` }] };
          }
          return { content: [{ type: 'text' as const, text: `✅ eval 자동 생성 완료\n\n📄 경로: \`${autoResult.path}\`\n🔑 키워드: ${autoResult.keywords.join(', ')}\n📝 프롬프트: ${autoResult.prompt.slice(0, 100)}...` }] };
        }

        case 'bulk_generate_evals': {
          const { bulkGenerateEvals } = await import('./core/skill-eval.js');
          const bulkResult = await bulkGenerateEvals();
          const genList = bulkResult.generated.length > 0 ? bulkResult.generated.map(s => `- ✅ ${s}`).join('\n') : '없음';
          const errList = bulkResult.errors.length > 0 ? bulkResult.errors.map(e => `- ❌ ${e.skill}: ${e.error}`).join('\n') : '없음';
          return { content: [{ type: 'text' as const, text: `## 📦 Eval 일괄 생성 결과\n\n**생성**: ${bulkResult.generated.length}개\n**스킵** (이미 있음): ${bulkResult.skipped.length}개\n**에러**: ${bulkResult.errors.length}개\n\n### 생성된 스킬\n${genList}\n\n### 에러\n${errList}` }] };
        }

        default:
          return { content: [{ type: 'text' as const, text: '❌ Unknown action. Use: start_baseline, end_with_skill, get_stats, summary, flush, flush_all, run_eval, scan_evals, retire, reactivate, auto_generate_eval, bulk_generate_evals' }] };
      }
    },
  );


  // ─── Tool: external_review ───
  // Unified Council (5인) / 팀장 검수 (1~2인) / custom routing
  const llmRouter = new LLMRouter();

  server.tool(
    'external_review',
    'External LLM review — council(5인 전원) | team_lead(코드 검수 1인) | custom(자유 구성)',
    {
      mode: z.enum(['council', 'team_lead', 'custom']).describe('council=5인 전략회의, team_lead=코드검수 1인, custom=자유 구성'),
      topic: z.string().describe('안건 / 검수할 코드 / 질문'),
      context: z.string().optional().describe('추가 컨텍스트 (PRD, 배경, diff 등)'),
      roles: z.array(z.object({
        name: z.string().describe('역할명 (예: CTO, 보안 감사자)'),
        systemPrompt: z.string().optional().describe('커스텀 시스템 프롬프트 (없으면 기본값)'),
        provider: z.string().optional().describe('프로바이더 ID (openai | deepseek-cloud | qwen3-local | gemma3-local)'),
      })).optional().describe('custom 모드에서만 사용. council/team_lead는 프리셋 사용'),
      provider: z.string().optional().describe('team_lead 모드에서 사용할 프로바이더 (기본: deepseek-cloud)'),
    },
    async (params) => {
      if (!registry.isEnabled('external_review')) {
        return { content: [{ type: 'text' as const, text: registry.disabledMessage('external_review') }] };
      }
      log.info('external_review called', { mode: params.mode, topicLen: params.topic.length });

      const fullTopic = params.context
        ? `## 안건\n${params.topic}\n\n## 컨텍스트\n${params.context}`
        : params.topic;

      let requests;

      if (params.mode === 'council') {
        // Fixed 5-member council with preset role→provider mapping
        requests = llmRouter.buildCouncilRequests(fullTopic);
      } else if (params.mode === 'team_lead') {
        // Single code-reviewer (팀장)
        requests = [llmRouter.buildTeamLeadRequest(fullTopic, { provider: params.provider })];
      } else {
        // Custom: user-defined roles
        if (!params.roles || params.roles.length === 0) {
          return { content: [{ type: 'text' as const, text: '❌ custom 모드에서는 roles 배열이 필수입니다.' }] };
        }
        requests = params.roles.map((r) => ({
          role: r.name,
          systemPrompt: r.systemPrompt ?? `당신은 ${r.name}입니다. 반드시 한국어로만 답변하세요.`,
          userMessage: fullTopic,
          provider: r.provider ?? 'deepseek-cloud',
        }));
      }

      // Parallel invoke — partial failures don't block
      const responses = await llmRouter.invokeParallel(requests);
      const stats = llmRouter.getStats();

      // Format output
      const sections = responses.map((r) => [
        `## ${r.success ? '✅' : '❌'} ${r.role} (${r.model})`,
        r.content,
        `> ⏱ ${r.durationMs}ms | 💰 $${r.cost.toFixed(3)}`,
      ].join('\n\n'));

      const summary = [
        `---`,
        `## 📊 리뷰 요약`,
        `- 참여: ${responses.length}인 | 성공: ${responses.filter((r) => r.success).length}인`,
        `- 총 비용: $${stats.totalCostUsd.toFixed(3)} | 누적 호출: ${stats.totalCalls}회`,
      ].join('\n');

      const fullReport = [...sections, summary].join('\n\n---\n\n');
      return { content: [{ type: 'text' as const, text: fullReport }] };
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
