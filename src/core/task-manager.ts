// Task manager — manages agent tasks via Obsidian Vault markdown files
import { ObsidianStore } from './obsidian-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('task-manager');

export type TaskStatus = 'queued' | 'active' | 'completed' | 'failed' | 'archived';

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface TaskManagerOptions {
  store: ObsidianStore;
  /** Vault-relative path to agent data directory */
  agentDataDir: string;
}

/**
 * Manages agent tasks stored as Obsidian markdown notes.
 *
 * Design doc Section 3 — Obsidian Vault 구조:
 *   {agentDataDir}/tasks/queue.md      — YAML frontmatter with task list
 *   {agentDataDir}/tasks/active.md     — Currently active task (separate file)
 *   {agentDataDir}/tasks/archive/      — Completed/failed tasks
 *   {agentDataDir}/sessions/           — Session logs
 */
export class TaskManager {
  private store: ObsidianStore;
  private tasksDir: string;
  private sessionsDir: string;

  constructor(options: TaskManagerOptions) {
    this.store = options.store;
    this.tasksDir = `${options.agentDataDir}/tasks`;
    this.sessionsDir = `${options.agentDataDir}/sessions`;
    log.info('TaskManager initialized', { tasksDir: this.tasksDir });
  }

  /**
   * Get all tasks from the queue.
   */
  async getQueue(): Promise<AgentTask[]> {
    const queuePath = `${this.tasksDir}/queue.md`;

    if (!(await this.store.exists(queuePath))) {
      log.info('Queue file does not exist, returning empty queue');
      return [];
    }

    const note = await this.store.readNote(queuePath);
    const tasks = (note.frontmatter.tasks as AgentTask[]) || [];
    log.debug(`Queue has ${tasks.length} tasks`);
    return tasks;
  }

  /**
   * Create a new task and add it to the queue.
   */
  async createTask(task: Omit<AgentTask, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<AgentTask> {
    const now = new Date().toISOString();
    const newTask: AgentTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      ...task,
    };

    const queue = await this.getQueue();
    queue.push(newTask);

    await this.saveQueue(queue);
    log.info(`Task created: ${newTask.id} — "${newTask.title}"`);
    return newTask;
  }

  /**
   * Update the status of a task in the queue.
   * When status changes to 'active', also writes to active.md.
   */
  async updateTask(id: string, updates: Partial<Pick<AgentTask, 'status' | 'title' | 'description' | 'priority'>>): Promise<AgentTask | null> {
    const queue = await this.getQueue();
    const index = queue.findIndex((t) => t.id === id);

    if (index === -1) {
      log.warn(`Task not found: ${id}`);
      return null;
    }

    queue[index] = {
      ...queue[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveQueue(queue);

    // Design doc Section 3: active.md is a separate file
    if (updates.status === 'active') {
      await this.writeActiveTask(queue[index]);
    } else if (updates.status && updates.status !== ('active' as TaskStatus)) {
      // Clear active.md if task is no longer active
      await this.clearActiveTask();
    }

    log.info(`Task updated: ${id}`, updates);
    return queue[index];
  }

  /**
   * Move a completed/failed task to the archive.
   */
  async archiveTask(id: string): Promise<boolean> {
    const queue = await this.getQueue();
    const index = queue.findIndex((t) => t.id === id);

    if (index === -1) {
      log.warn(`Task not found for archiving: ${id}`);
      return false;
    }

    const task = queue[index];
    queue.splice(index, 1);

    // Save remaining queue
    await this.saveQueue(queue);

    // Clear active.md if this was the active task
    if (task.status === 'active') {
      await this.clearActiveTask();
    }

    // Write archive note
    const archivePath = `${this.tasksDir}/archive/${task.id}.md`;
    await this.store.writeNote(
      archivePath,
      `# ${task.title}\n\n${task.description}`,
      {
        ...task,
        archivedAt: new Date().toISOString(),
      },
    );

    log.info(`Task archived: ${id}`);
    return true;
  }

  /**
   * Get the currently active task from active.md (design doc Section 3).
   */
  async getActiveTask(): Promise<AgentTask | null> {
    const activePath = `${this.tasksDir}/active.md`;

    if (!(await this.store.exists(activePath))) {
      return null;
    }

    try {
      const note = await this.store.readNote(activePath);
      const task = note.frontmatter as unknown as AgentTask;
      return task && task.id ? task : null;
    } catch {
      return null;
    }
  }

  /**
   * Write the active task to active.md (design doc Section 3).
   */
  private async writeActiveTask(task: AgentTask): Promise<void> {
    const activePath = `${this.tasksDir}/active.md`;
    await this.store.writeNote(
      activePath,
      `# 현재 진행 중: ${task.title}\n\n${task.description}`,
      { ...task },
    );
    log.info(`Active task written: ${task.id}`);
  }

  /**
   * Clear active.md when no task is active.
   */
  private async clearActiveTask(): Promise<void> {
    const activePath = `${this.tasksDir}/active.md`;
    await this.store.writeNote(
      activePath,
      '_No active task._',
      { status: 'idle' },
    );
  }

  /**
   * Log a session entry (design doc Section 3: sessions/ directory).
   */
  async logSession(entry: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sessionPath = `${this.sessionsDir}/${today}.md`;
    const timestamp = new Date().toLocaleTimeString('ko-KR');

    let existing = '';
    if (await this.store.exists(sessionPath)) {
      const note = await this.store.readNote(sessionPath);
      existing = note.content;
    }

    const newEntry = `${existing}\n\n## ${timestamp}\n\n${entry}`.trim();

    await this.store.writeNote(
      sessionPath,
      newEntry,
      {
        date: today,
        type: 'session-log',
        updatedAt: new Date().toISOString(),
      },
    );

    log.debug(`Session logged: ${sessionPath}`);
  }

  /**
   * Save the task queue back to Obsidian.
   */
  private async saveQueue(tasks: AgentTask[]): Promise<void> {
    const queuePath = `${this.tasksDir}/queue.md`;
    const content = tasks.length > 0
      ? tasks.map((t) => `- **[${t.status}]** ${t.title} (${t.priority})`).join('\n')
      : '_No tasks in queue._';

    await this.store.writeNote(queuePath, content, { tasks });
  }
}
