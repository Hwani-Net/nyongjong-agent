// Git worktree manager — isolates experiments in separate worktrees
import { ShellRunner } from './shell-runner.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('git-worktree');

export interface GitWorktreeOptions {
  /** Path to the main repo */
  repoPath: string;
  /** Shell runner instance */
  shellRunner: ShellRunner;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}

export class GitWorktree {
  private repoPath: string;
  private shell: ShellRunner;

  constructor(options: GitWorktreeOptions) {
    this.repoPath = options.repoPath;
    this.shell = options.shellRunner;
    log.info('GitWorktree initialized', { repoPath: this.repoPath });
  }

  /**
   * Create a new worktree with a new branch for isolated work.
   */
  async create(worktreePath: string, branchName: string): Promise<boolean> {
    log.info(`Creating worktree: ${worktreePath} (branch: ${branchName})`);

    const result = await this.shell.run(
      `git worktree add "${worktreePath}" -b "${branchName}"`,
      this.repoPath,
    );

    if (result.exitCode !== 0) {
      log.error('Failed to create worktree', result.stderr);
      return false;
    }

    log.info(`Worktree created: ${worktreePath}`);
    return true;
  }

  /**
   * Remove a worktree.
   */
  async remove(worktreePath: string): Promise<boolean> {
    log.info(`Removing worktree: ${worktreePath}`);

    const result = await this.shell.run(
      `git worktree remove "${worktreePath}" --force`,
      this.repoPath,
    );

    if (result.exitCode !== 0) {
      log.warn('Failed to remove worktree', result.stderr);
      return false;
    }

    return true;
  }

  /**
   * List all worktrees.
   */
  async list(): Promise<WorktreeInfo[]> {
    const result = await this.shell.run('git worktree list --porcelain', this.repoPath);

    if (result.exitCode !== 0) {
      log.warn('Failed to list worktrees');
      return [];
    }

    const worktrees: WorktreeInfo[] = [];
    const blocks = result.stdout.split('\n\n').filter(Boolean);

    for (const block of blocks) {
      const lines = block.split('\n');
      const pathLine = lines.find((l) => l.startsWith('worktree '));
      const branchLine = lines.find((l) => l.startsWith('branch '));

      if (pathLine) {
        worktrees.push({
          path: pathLine.replace('worktree ', '').trim(),
          branch: branchLine ? branchLine.replace('branch refs/heads/', '').trim() : 'HEAD',
          isMain: !branchLine || branchLine.includes('master') || branchLine.includes('main'),
        });
      }
    }

    return worktrees;
  }

  /**
   * Merge a worktree branch back into main and clean up.
   */
  async mergeAndCleanup(worktreePath: string, branchName: string): Promise<boolean> {
    log.info(`Merging ${branchName} into main and cleaning up`);

    // Merge the branch
    const mergeResult = await this.shell.run(
      `git merge "${branchName}" --no-edit`,
      this.repoPath,
    );

    if (mergeResult.exitCode !== 0) {
      log.error('Merge failed', mergeResult.stderr);
      return false;
    }

    // Remove the worktree
    await this.remove(worktreePath);

    // Delete the branch
    await this.shell.run(`git branch -d "${branchName}"`, this.repoPath);

    log.info('Merge and cleanup complete');
    return true;
  }
}
