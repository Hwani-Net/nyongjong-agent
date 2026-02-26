import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/core/tool-registry.js';

describe('ToolRegistry', () => {
  it('should register and list tools', () => {
    const reg = new ToolRegistry();
    reg.register('test_tool', 'test', 'A test tool');
    const state = reg.getState();
    expect(state).toHaveLength(1);
    expect(state[0].name).toBe('test_tool');
    expect(state[0].enabled).toBe(true);
  });

  it('should toggle individual tool on/off', () => {
    const reg = new ToolRegistry();
    reg.register('tool_a', 'group1', 'Tool A');
    expect(reg.isEnabled('tool_a')).toBe(true);

    reg.toggle('tool_a', false);
    expect(reg.isEnabled('tool_a')).toBe(false);

    reg.toggle('tool_a', true);
    expect(reg.isEnabled('tool_a')).toBe(true);
  });

  it('should toggle entire group', () => {
    const reg = new ToolRegistry();
    reg.register('g1_a', 'grp', 'Tool A');
    reg.register('g1_b', 'grp', 'Tool B');
    reg.register('other', 'other_grp', 'Other');

    const affected = reg.toggleGroup('grp', false);
    expect(affected).toEqual(['g1_a', 'g1_b']);
    expect(reg.isEnabled('g1_a')).toBe(false);
    expect(reg.isEnabled('g1_b')).toBe(false);
    expect(reg.isEnabled('other')).toBe(true);
  });

  it('should return disabled message', () => {
    const reg = new ToolRegistry();
    reg.register('my_tool', 'test', 'My tool');
    reg.toggle('my_tool', false);
    const msg = reg.disabledMessage('my_tool');
    expect(msg).toContain('DISABLED');
    expect(msg).toContain('my_tool');
  });

  it('should default to enabled for unregistered tools', () => {
    const reg = new ToolRegistry();
    expect(reg.isEnabled('unknown')).toBe(true);
  });

  it('should generate summary grouped by group', () => {
    const reg = new ToolRegistry();
    reg.register('a', 'alpha', 'A');
    reg.register('b', 'alpha', 'B');
    reg.register('c', 'beta', 'C');
    reg.toggle('b', false);

    const summary = reg.getSummary();
    expect(summary.alpha.enabled).toContain('a');
    expect(summary.alpha.disabled).toContain('b');
    expect(summary.beta.enabled).toContain('c');
  });
});
