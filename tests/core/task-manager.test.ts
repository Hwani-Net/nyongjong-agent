// Tests for TaskManager — Obsidian-based task queue management
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ObsidianStore } from '../../src/core/obsidian-store.js';
import { TaskManager } from '../../src/core/task-manager.js';

describe('TaskManager', () => {
  let tempDir: string;
  let store: ObsidianStore;
  let taskManager: TaskManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'task-test-'));
    store = new ObsidianStore({ vaultPath: tempDir });
    taskManager = new TaskManager({ store, agentDataDir: 'agent' });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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
    expect(updated?.updatedAt).not.toBe(task.updatedAt);
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
