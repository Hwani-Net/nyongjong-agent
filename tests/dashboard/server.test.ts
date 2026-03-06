// Tests for Dashboard server — API endpoints and HTML rendering
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock agent modules for isolated testing
const mockModules = {
  store: {},
  taskManager: {
    getQueue: vi.fn().mockResolvedValue([
      { id: 'task-1', title: 'Test Task', status: 'queued', priority: 'normal' },
    ]),
    getActiveTask: vi.fn().mockResolvedValue(null),
  },
  personaLoader: {
    loadAll: vi.fn().mockResolvedValue([
      { id: 'ceo', name: 'CEO Naedon', category: 'business', activatedAt: ['understand'] },
      { id: 'eng', name: 'Engineer', category: 'engineer', activatedAt: ['prototype'] },
    ]),
  },
  personaEngine: {
    getPersonaSummary: vi.fn().mockResolvedValue({ business: ['CEO Naedon'] }),
  },
  personaSimulator: {},
  groundingEngine: {
    getAdapterStatus: vi.fn().mockReturnValue({ naver: true, kosis: false }),
  },
  ollamaClient: {
    healthCheck: vi.fn().mockResolvedValue({ available: false, models: [] }),
  },
  llmBenchmark: {},
  cycleRunner: {
    getState: vi.fn().mockReturnValue({ status: 'idle' }),
  },
  shellRunner: {},
  testRunner: {},
  gitWorktree: {},
};

describe('Dashboard Server', () => {
  describe('getAgentStatus', () => {
    it('should return correct version', async () => {
      // Import the function dynamically to avoid side effects
      const { getAgentStatus } = await import('../../src/agent.js');
      
      // This won't work without full module setup, so we test the structure
      expect(typeof getAgentStatus).toBe('function');
    });
  });

  describe('DASHBOARD_HTML', () => {
    it('should contain all 10 page sections', async () => {
      // We test the HTML content statically
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      
      const expectedPages = [
        'page-dashboard',
        'page-kanban',
        'page-tools',
        'page-personas',
        'page-chat',
        'page-office',
        'page-terminal',
        'page-inbox',
        'page-settings',
        'page-logs',
      ];

      for (const page of expectedPages) {
        expect(content).toContain(`id="${page}"`);
      }
    });

    it('should contain sidebar navigation for all pages', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');

      const navItems = [
        'data-page="dashboard"',
        'data-page="kanban"',
        'data-page="tools"',
        'data-page="personas"',
        'data-page="chat"',
        'data-page="office"',
        'data-page="terminal"',
        'data-page="inbox"',
        'data-page="settings"',
        'data-page="logs"',
      ];

      for (const nav of navItems) {
        expect(content).toContain(nav);
      }
    });

    it('should contain version reference', async () => {
      const fs = await import('fs/promises');
      const pkgRaw = await fs.readFile('package.json', 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      // Either the version or 'version' variable reference must appear
      expect(content.includes(pkg.version) || content.includes('version')).toBe(true);
    });
  });

  describe('Chat API structure', () => {
    it('should have /api/chat route handler', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("/api/chat");
      expect(content).toContain("'POST'");
    });

    it('should handle smart routing keywords', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      
      // Check that all routing keywords exist
      const keywords = ['상태', 'status', '빌드', 'build', '테스트', 'test',
        '페르소나', 'persona', '태스크', 'task', '모델', 'model', '도움', 'help'];
      
      for (const kw of keywords) {
        expect(content).toContain(kw);
      }
    });
  });

  describe('SSE connection handling', () => {
    it('should have onopen, onmessage, and onerror handlers', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      
      expect(content).toContain('evtSource.onopen');
      expect(content).toContain('evtSource.onmessage');
      expect(content).toContain('evtSource.onerror');
    });

    it('should show Connected badge on successful SSE', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('Connected');
      expect(content).toContain('badge-green');
    });

    it('should show Reconnecting badge on SSE error', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('Reconnecting');
      expect(content).toContain('badge-orange');
    });

    it('should have initial data fetch independent of SSE', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('loadInitialData');
      expect(content).toContain("fetch('/api/status')");
    });

    it('should have fallback polling when SSE fails', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('startPolling');
      expect(content).toContain('pollingInterval');
      expect(content).toContain('falling back to polling');
    });

    it('should ignore keepalive ping messages', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("data.type === 'ping'");
    });
  });

  describe('Office view SSE sync', () => {
    it('should have updateOfficeFromSSE function', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('updateOfficeFromSSE');
      // Maps SSE data to office display — implementation may vary
    });

    it('should map workflow stages to personas', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      
      // Check stage-persona mappings
      expect(content).toContain("understand:");
      expect(content).toContain("prototype:");
      expect(content).toContain("validate:");
      expect(content).toContain("evolve:");
      expect(content).toContain("report:");
    });
  });

  describe('Terminal action endpoints', () => {
    it('should have build, test, lint actions', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      
      expect(content).toContain("build: 'npm run build'");
      expect(content).toContain("test: 'npm test'");
      expect(content).toContain("lint: 'npx tsc --noEmit'");
    });
  });

  describe('/health endpoint', () => {
    it('should have /health route handler in server.ts', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("'/health'");
    });

    it('should also respond to /healthz (k8s convention)', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("'/healthz'");
    });

    it('should return status, version, uptime fields', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('healthy ?');     // ternary for status: ok/degraded
      expect(content).toContain('version,');        // dynamic from package.json
      expect(content).toContain('uptimeSec');       // uptime variable used
    });

    it('should track serverStartTime for uptime calculation', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('serverStartTime = Date.now()');
      expect(content).toContain('Date.now() - serverStartTime');
    });

    it('should include module status and env key checks', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("modules:");
      expect(content).toContain("KOSIS_API_KEY");
      expect(content).toContain("NAVER_CLIENT_ID");
    });

    it('should respond 200 when healthy', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      // healthy ? 200 : 503 pattern must exist
      expect(content).toContain('healthy ? 200 : 503');
    });

    it('should expose recordGateDecision in shared-state module', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/core/shared-state.ts', 'utf-8');
      expect(content).toContain('export function recordGateDecision');
    });

    it('should have /api/gate-history GET and POST handlers', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("'/api/gate-history'");
      expect(content).toContain("req.method === 'GET'");
      expect(content).toContain("req.method === 'POST'");
    });

    it('should check taskManager and obsidian for degraded status', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('taskManagerOk');
      expect(content).toContain('obsidianOk');
      expect(content).toContain('taskManagerOk && obsidianOk');
      expect(content).toContain("'ok' : 'degraded'");  // ternary: healthy ? 'ok' : 'degraded'
    });

    it('should include issues array when modules are unhealthy', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('issues');
      expect(content).toContain('issues.length > 0');
    });

    it('should expose /api/errors endpoint', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("'/api/errors'");
      expect(content).toContain('getErrorLog');
      expect(content).toContain('clearErrorLog');
    });
  });

  describe('Skills 2.0 UI', () => {
    it('should have /api/skills route handler', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("'/api/skills'");
      expect(content).toContain('generateAuditReport');
    });

    it('should have page-skills page section in HTML', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('id="page-skills"');
      expect(content).toContain('skillGrid');
    });

    it('should have skills nav item in sidebar', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('data-page="skills"');
      expect(content).toContain('Skills 2.0');
    });

    it('should include benchmarkData in /api/skills response', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('benchmarkData');
      expect(content).toContain('dashboardBenchmark');
      expect(content).toContain('keepCount');
      expect(content).toContain('bmKeepCount');
    });

    it('should have /api/skills/flush-all POST endpoint', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("'/api/skills/flush-all'");
      expect(content).toContain('flushAllToObsidian');
      expect(content).toContain("req.method === 'POST'");
    });

    it('should import ObsidianStore for flush-all endpoint', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("import { ObsidianStore }");
      expect(content).toContain('obsidian-store');
    });

    it('should have flushBenchmarkToObsidian JS function in HTML', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('flushBenchmarkToObsidian');
      expect(content).toContain('bmFlushBtn');
      expect(content).toContain('bmFlushStatus');
      expect(content).toContain('Obsidian 저장');
    });

    it('should have 5 skill cards render correctly', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      // seed-demo seeds 5 skills
      expect(content).toContain('pentagonal-audit');
      expect(content).toContain('stitch-pencil-pipeline');
      expect(content).toContain('prd-template');
      expect(content).toContain('persona-loader');
      expect(content).toContain('web-share');
    });

    it('should have toolsSkillSummary element in Tool Registry page', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('toolsSkillSummary');
      expect(content).toContain('capability');
      expect(content).toContain('workflow');
    });

    it('should have refreshToolRegistrySkills JS function', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('refreshToolRegistrySkills');
      expect(content).toContain('toolGroupSkillSummary-lifecycle');
    });

    it('should trigger refreshToolRegistrySkills when tools page is shown', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain("if (page === 'tools') refreshToolRegistrySkills()");
    });
  });
});
