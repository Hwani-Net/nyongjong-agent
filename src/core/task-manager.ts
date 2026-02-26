// Task manager — manages agent tasks via Obsidian Vault markdown files
import { ObsidianStore, type NoteData } from './obsidian-store.js';
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
 * Directory structure:
 *   {agentDataDir}/tasks/queue.md      — YAML frontmatter with task list
 *   {agentDataDir}/tasks/active.md     — Currently active task
 *   {agentDataDir}/tasks/archive/      — Completed/failed tasks
 */
export class TaskManager {
  private store: ObsidianStore;
  private tasksDir: string;

  constructor(options: TaskManagerOptions) {
    this.store = options.store;
    this.tasksDir = `${options.agentDataDir}/tasks`;
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
   * Get the currently active task (if any).
   */
  async getActiveTask(): Promise<AgentTask | null> {
    const queue = await this.getQueue();
    return queue.find((t) => t.status === 'active') || null;
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
