// Tests for execution modules: shell-runner, test-runner, git-worktree
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShellRunner } from '../../src/execution/shell-runner.js';
import { TestRunner } from '../../src/execution/test-runner.js';
import { GitWorktree } from '../../src/execution/git-worktree.js';

// ─── ShellRunner ─────────────────────────────────────────────────────
describe('ShellRunner', () => {
  let runner: ShellRunner;

  beforeEach(() => {
    runner = new ShellRunner({ defaultTimeoutMs: 5000 });
  });

  it('should run a successful command', async () => {
    const result = await runner.run('echo hello', process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should capture exit code for failing commands', async () => {
    const result = await runner.run('node -e "process.exit(42)"', process.cwd());
    expect(result.exitCode).not.toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should capture stderr output', async () => {
    const result = await runner.run('node -e "console.error(\'err msg\')"', process.cwd());
    expect(result.stderr).toContain('err msg');
  });

  it('should run a sequence stopping on first failure', async () => {
    const results = await runner.runSequence(
      ['echo step1', 'node -e "process.exit(1)"', 'echo step3'],
      process.cwd(),
      true,
    );

    expect(results.length).toBe(2); // Stopped at step 2
    expect(results[0].exitCode).toBe(0);
    expect(results[1].exitCode).not.toBe(0);
  });

  it('should run a sequence continuing on failure when stopOnError is false', async () => {
    const results = await runner.runSequence(
      ['echo step1', 'node -e "process.exit(1)"', 'echo step3'],
      process.cwd(),
      false,
    );

    expect(results.length).toBe(3); // All ran
  });
});

// ─── TestRunner ──────────────────────────────────────────────────────
describe('TestRunner', () => {
  it('should parse vitest output correctly', () => {
    const shellRunner = new ShellRunner();
    const runner = new TestRunner({
      shellRunner,
      projectRoot: process.cwd(),
    });

    // Use the private method via reflection
    const parsed = (runner as any).parseVitestOutput(
      'Test Files  8 passed (8)\n      Tests  70 passed (70)',
    );

    expect(parsed).toEqual({
      total: 70,
      passed: 70,
      failed: 0,
      skipped: 0,
    });
  });

  it('should parse vitest output with failures', () => {
    const runner = new TestRunner({
      shellRunner: new ShellRunner(),
      projectRoot: process.cwd(),
    });

    const parsed = (runner as any).parseVitestOutput(
      'Tests  2 failed | 18 passed (20)',
    );

    expect(parsed).toEqual({
      total: 20,
      passed: 18,
      failed: 2,
      skipped: 0,
    });
  });

  it('should return undefined for non-vitest output', () => {
    const runner = new TestRunner({
      shellRunner: new ShellRunner(),
      projectRoot: process.cwd(),
    });

    const parsed = (runner as any).parseVitestOutput('random output');
    expect(parsed).toBeUndefined();
  });
});

// ─── GitWorktree ─────────────────────────────────────────────────────
describe('GitWorktree', () => {
  it('should list worktrees', async () => {
    const shellRunner = new ShellRunner();
    const git = new GitWorktree({ repoPath: process.cwd(), shellRunner });

    const worktrees = await git.list();
    expect(worktrees.length).toBeGreaterThanOrEqual(1);
    expect(worktrees[0]).toHaveProperty('path');
    expect(worktrees[0]).toHaveProperty('branch');
    expect(worktrees[0]).toHaveProperty('isMain');
  });

  // We don't test create/remove/merge to avoid modifying the real repo
  it('should handle failed list gracefully', async () => {
    const mockShell = {
      run: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not a git repo', durationMs: 50 }),
      runSequence: vi.fn(),
    } as any;

    const git = new GitWorktree({ repoPath: '/nonexistent', shellRunner: mockShell });
    const worktrees = await git.list();
    expect(worktrees).toEqual([]);
  });
});
