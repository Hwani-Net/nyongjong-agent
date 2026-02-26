// Tests for GitWorktree — mocked shell runner
import { describe, it, expect, vi } from 'vitest';
import { GitWorktree } from '../../src/execution/git-worktree.js';
import { ShellRunner } from '../../src/execution/shell-runner.js';

function createMockShell(responses: Record<string, { exitCode: number; stdout: string; stderr: string }>) {
  const run = vi.fn(async (cmd: string, _cwd: string) => {
    for (const [key, val] of Object.entries(responses)) {
      if (cmd.includes(key)) {
        return { ...val, durationMs: 50 };
      }
    }
    return { exitCode: 0, stdout: '', stderr: '', durationMs: 10 };
  });
  return { run } as unknown as ShellRunner;
}

describe('GitWorktree', () => {
  it('should create worktree successfully', async () => {
    const shell = createMockShell({
      'worktree add': { exitCode: 0, stdout: 'Created worktree', stderr: '' },
    });
    const wt = new GitWorktree({ repoPath: '/tmp/repo', shellRunner: shell });

    const result = await wt.create('/tmp/wt1', 'feature-123');
    expect(result).toBe(true);
    expect(shell.run).toHaveBeenCalledWith(
      expect.stringContaining('worktree add'),
      '/tmp/repo',
    );
  });

  it('should return false on create failure', async () => {
    const shell = createMockShell({
      'worktree add': { exitCode: 1, stdout: '', stderr: 'fatal: already exists' },
    });
    const wt = new GitWorktree({ repoPath: '/tmp/repo', shellRunner: shell });

    const result = await wt.create('/tmp/wt1', 'branch-dup');
    expect(result).toBe(false);
  });

  it('should remove worktree successfully', async () => {
    const shell = createMockShell({
      'worktree remove': { exitCode: 0, stdout: '', stderr: '' },
    });
    const wt = new GitWorktree({ repoPath: '/tmp/repo', shellRunner: shell });

    const result = await wt.remove('/tmp/old-wt');
    expect(result).toBe(true);
  });

  it('should return false on remove failure', async () => {
    const shell = createMockShell({
      'worktree remove': { exitCode: 1, stdout: '', stderr: 'error: not a worktree' },
    });
    const wt = new GitWorktree({ repoPath: '/tmp/repo', shellRunner: shell });

    const result = await wt.remove('/tmp/fake');
    expect(result).toBe(false);
  });

  it('should list worktrees from porcelain output', async () => {
    const shell = createMockShell({
      'worktree list': {
        exitCode: 0,
        stdout: 'worktree /repo\nbranch refs/heads/master\n\nworktree /repo-wt\nbranch refs/heads/feature-x',
        stderr: '',
      },
    });
    const wt = new GitWorktree({ repoPath: '/repo', shellRunner: shell });

    const list = await wt.list();
    expect(list).toHaveLength(2);
    expect(list[0].path).toBe('/repo');
    expect(list[0].isMain).toBe(true);
    expect(list[1].path).toBe('/repo-wt');
    expect(list[1].branch).toBe('feature-x');
    expect(list[1].isMain).toBe(false);
  });

  it('should return empty array when list fails', async () => {
    const shell = createMockShell({
      'worktree list': { exitCode: 128, stdout: '', stderr: 'not a git repo' },
    });
    const wt = new GitWorktree({ repoPath: '/tmp/bad', shellRunner: shell });

    const list = await wt.list();
    expect(list).toEqual([]);
  });

  it('should merge and cleanup successfully', async () => {
    const shell = createMockShell({
      'merge': { exitCode: 0, stdout: 'Fast-forward', stderr: '' },
      'worktree remove': { exitCode: 0, stdout: '', stderr: '' },
      'branch -d': { exitCode: 0, stdout: '', stderr: '' },
    });
    const wt = new GitWorktree({ repoPath: '/repo', shellRunner: shell });

    const result = await wt.mergeAndCleanup('/tmp/wt', 'feature-done');
    expect(result).toBe(true);
  });

  it('should return false when merge fails', async () => {
    const shell = createMockShell({
      'merge': { exitCode: 1, stdout: '', stderr: 'CONFLICT' },
    });
    const wt = new GitWorktree({ repoPath: '/repo', shellRunner: shell });

    const result = await wt.mergeAndCleanup('/tmp/wt', 'conflict-branch');
    expect(result).toBe(false);
  });
});
