// MCP Server — exposes agent capabilities as MCP tools for Antigravity
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ObsidianStore } from './core/obsidian-store.js';
import { TaskManager } from './core/task-manager.js';
import { recommendModel, listModels, type TaskType, type Complexity } from './core/model-selector.js';
import { type AppConfig } from './core/config.js';
import { PersonaLoader } from './personas/persona-loader.js';
import { PersonaEngine } from './personas/persona-engine.js';
import { PersonaSimulator } from './personas/persona-simulator.js';
import { analyzeGoal } from './workflow/understand.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('mcp-server');

export interface McpServerOptions {
  config: AppConfig;
}

/**
 * Create and configure the MCP server with all agent tools.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const { config } = options;

  const server = new McpServer({
    name: 'naedon-agent',
    version: '0.2.0',
  });

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

  // ─── Tool: agent_status ───
  server.tool(
    'agent_status',
    'Check the current status of the 뇽죵이 agent server',
    {},
    async () => {
      log.debug('agent_status called');
      const activeTask = await taskManager.getActiveTask();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'running',
            version: '0.2.0',
            activeTask: activeTask ? { id: activeTask.id, title: activeTask.title } : null,
            obsidianVault: config.OBSIDIAN_VAULT_PATH,
            ollamaUrl: config.OLLAMA_URL,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: task_list ───
  server.tool(
    'task_list',
    'List all tasks in the agent queue',
    {},
    async () => {
      log.debug('task_list called');
      const tasks = await taskManager.getQueue();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(tasks, null, 2),
        }],
      };
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
      log.info('task_create called', params);
      const task = await taskManager.createTask(params);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        }],
      };
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
      log.debug('recommend_model called', params);
      const recommendation = recommendModel({
        taskType: params.taskType as TaskType,
        complexity: params.complexity as Complexity,
        budgetConstrained: params.budgetConstrained,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(recommendation, null, 2),
        }],
      };
    },
  );

  // ─── Tool: list_models ───
  server.tool(
    'list_models',
    'List all available AI models with their cost tiers',
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(listModels(), null, 2),
        }],
      };
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
      log.debug('memory_search called', params);
      const dir = params.directory || config.AGENT_DATA_DIR;
      const results = await store.searchNotes(dir, params.query);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            results.map((r) => ({ path: r.path, frontmatter: r.frontmatter, preview: r.content.slice(0, 200) })),
            null,
            2,
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
      log.info('memory_write called', { path: params.path });
      await store.writeNote(params.path, params.content, params.frontmatter);
      return {
        content: [{
          type: 'text' as const,
          text: `✅ Note written to ${params.path}`,
        }],
      };
    },
  );

  // ─── Tool: persona_list ───
  server.tool(
    'persona_list',
    'List all available personas grouped by category',
    {},
    async () => {
      log.debug('persona_list called');
      const summary = await personaEngine.getPersonaSummary();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(summary, null, 2),
        }],
      };
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
      log.info('persona_consult called', params);
      const plan = await personaEngine.createConsultationPlan({
        stage: params.stage,
        topic: params.topic,
        maxPersonas: params.maxPersonas,
      });

      // If personas available and Ollama is up, run simulation
      if (plan.consultations.length > 0) {
        const health = await personaSimulator.healthCheck();
        if (health.available) {
          const results = await personaSimulator.runPlan(plan);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            }],
          };
        }
        // Ollama not available — return prompts only
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

      return {
        content: [{
          type: 'text' as const,
          text: 'No personas found for this stage/topic. Create personas first.',
        }],
      };
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
      log.info('analyze_goal called', { goalLength: params.goal.length });
      const result = analyzeGoal({
        goal: params.goal,
        projectContext: params.projectContext,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  // ─── Tool: ollama_health ───
  server.tool(
    'ollama_health',
    'Check if Ollama (local LLM) is running and list available models',
    {},
    async () => {
      const health = await personaSimulator.healthCheck();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(health, null, 2),
        }],
      };
    },
  );

  log.info('MCP Server configured with 11 tools');
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
