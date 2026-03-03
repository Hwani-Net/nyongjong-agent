// Tests for TaskManager — Obsidian-based task queue management
// ObsidianStore is fully mocked so tests don't need a real vault or REST API.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObsidianStore } from '../../src/core/obsidian-store.js';
import { TaskManager } from '../../src/core/task-manager.js';

// ── In-memory fake store ──────────────────────────────────────────────────
function makeFakeStore(): ObsidianStore {
  const db = new Map<string, string>(); // path → raw markdown content

  const store = {
    async readNote(path: string) {
      const raw = db.get(path);
      if (!raw) throw new Error(`ENOENT: ${path}`);
      // Parse minimal frontmatter/content
      const fm: Record<string, unknown> = {};
      let content = raw;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) {
          const yaml = raw.slice(4, end);
          yaml.split('\n').forEach((line) => {
            const [k, ...v] = line.split(': ');
            if (k && v.length) {
              const val = v.join(': ').trim();
              try { fm[k.trim()] = JSON.parse(val); } catch { fm[k.trim()] = val; }
            }
          });
          content = raw.slice(end + 4).trim();
        }
      }
      return { path, frontmatter: fm, content };
    },
    async writeNote(path: string, content: string, frontmatter?: Record<string, unknown>) {
      let raw = content;
      if (frontmatter && Object.keys(frontmatter).length > 0) {
        const fmLines = Object.entries(frontmatter)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('\n');
        raw = `---\n${fmLines}\n---\n${content}`;
      }
      db.set(path, raw);
    },
    async listNotes(dir: string) {
      return [...db.keys()].filter((p) => p.startsWith(dir) && p.endsWith('.md'));
    },
    async searchNotes() { return []; },
    async exists(path: string) { return db.has(path); },
    async deleteNote(path: string) {
      if (!db.has(path)) return false;
      db.delete(path);
      return true;
    },
    getCacheStats() { return { hits: 0, misses: 0, invalidations: 0, size: 0 }; },
    clearNoteCache() {},
  } as unknown as ObsidianStore;

  return store;
}

describe('TaskManager', () => {
  let store: ObsidianStore;
  let taskManager: TaskManager;

  beforeEach(() => {
    store = makeFakeStore();
    taskManager = new TaskManager({ store, agentDataDir: 'agent' });
  });

  it('should return empty queue when no tasks exist', async () => {
    const queue = await taskManager.getQueue();
    expect(queue).toEqual([]);
  });

  it('should create a task and add it to the queue', async () => {
    const task = await taskManager.createTask({
      title: 'Test Task',
      description: 'A test task for the agent',
      priority: 'normal',
    });

    expect(task.id).toMatch(/^task-/);
    expect(task.status).toBe('queued');
    expect(task.title).toBe('Test Task');
    expect(task.createdAt).toBeDefined();

    const queue = await taskManager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(task.id);
  });

  it('should update a task status', async () => {
    const task = await taskManager.createTask({
      title: 'Update Me',
      description: 'Will be updated',
      priority: 'high',
    });

    const updated = await taskManager.updateTask(task.id, { status: 'active' });
    expect(updated?.status).toBe('active');
    // updatedAt should be defined and a valid ISO string (may equal createdAt if same ms)
    expect(updated?.updatedAt).toBeDefined();
    expect(updated?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should return null when updating non-existent task', async () => {
    const result = await taskManager.updateTask('fake-id', { status: 'active' });
    expect(result).toBeNull();
  });

  it('should archive a completed task', async () => {
    const task = await taskManager.createTask({
      title: 'Archive Me',
      description: 'Will be archived',
      priority: 'low',
    });

    await taskManager.updateTask(task.id, { status: 'completed' });
    const archived = await taskManager.archiveTask(task.id);
    expect(archived).toBe(true);

    // Queue should be empty now
    const queue = await taskManager.getQueue();
    expect(queue).toHaveLength(0);

    // Archive file should exist
    const exists = await store.exists(`agent/tasks/archive/${task.id}.md`);
    expect(exists).toBe(true);
  });

  it('should return false when archiving non-existent task', async () => {
    const result = await taskManager.archiveTask('fake-id');
    expect(result).toBe(false);
  });

  it('should find active task', async () => {
    await taskManager.createTask({ title: 'Queued', description: '', priority: 'normal' });
    const active = await taskManager.createTask({ title: 'Active', description: '', priority: 'high' });
    await taskManager.updateTask(active.id, { status: 'active' });

    const found = await taskManager.getActiveTask();
    expect(found?.title).toBe('Active');
    expect(found?.status).toBe('active');
  });

  it('should create multiple tasks', async () => {
    await taskManager.createTask({ title: 'Task 1', description: '', priority: 'low' });
    await taskManager.createTask({ title: 'Task 2', description: '', priority: 'normal' });
    await taskManager.createTask({ title: 'Task 3', description: '', priority: 'high' });

    const queue = await taskManager.getQueue();
    expect(queue).toHaveLength(3);
  });
});
