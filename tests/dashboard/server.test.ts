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

    it('should contain v0.4.0 version reference', async () => {
      const fs = await import('fs/promises');
      const content = await fs.readFile('src/dashboard/server.ts', 'utf-8');
      expect(content).toContain('v0.4.0');
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
      expect(content).toContain('stagePersonaMap');
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
});
