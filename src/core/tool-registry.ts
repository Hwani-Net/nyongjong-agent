// Tool registry — runtime enable/disable of MCP tools
import { createLogger } from '../utils/logger.js';

const log = createLogger('tool-registry');

export interface ToolRegistryEntry {
  name: string;
  /** Whether this tool is currently enabled */
  enabled: boolean;
  /** Tool group for batch toggle */
  group: string;
  /** Human-readable description */
  description: string;
}

/**
 * Runtime tool registry.
 *
 * Manages which MCP tools are active. Tools check this registry
 * before executing. Disabled tools return a clear message instead
 * of performing their action.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolRegistryEntry>();

  constructor() {
    log.info('ToolRegistry initialized');
  }

  /**
   * Register a tool with initial state.
   */
  register(name: string, group: string, description: string, enabled = true): void {
    this.tools.set(name, { name, enabled, group, description });
  }

  /**
   * Check if a tool is enabled.
   */
  isEnabled(name: string): boolean {
    const entry = this.tools.get(name);
    return entry ? entry.enabled : true; // Default: enabled if not registered
  }

  /**
   * Toggle a single tool on/off.
   */
  toggle(name: string, enabled: boolean): boolean {
    const entry = this.tools.get(name);
    if (!entry) return false;
    entry.enabled = enabled;
    log.info(`Tool ${name}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    return true;
  }

  /**
   * Toggle all tools in a group on/off.
   */
  toggleGroup(group: string, enabled: boolean): string[] {
    const affected: string[] = [];
    for (const [name, entry] of this.tools) {
      if (entry.group === group) {
        entry.enabled = enabled;
        affected.push(name);
      }
    }
    log.info(`Group "${group}" ${enabled ? 'ENABLED' : 'DISABLED'}: ${affected.join(', ')}`);
    return affected;
  }

  /**
   * Get the full registry state.
   */
  getState(): ToolRegistryEntry[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a summary grouped by group name.
   */
  getSummary(): Record<string, { enabled: string[]; disabled: string[] }> {
    const summary: Record<string, { enabled: string[]; disabled: string[] }> = {};
    for (const entry of this.tools.values()) {
      if (!summary[entry.group]) {
        summary[entry.group] = { enabled: [], disabled: [] };
      }
      if (entry.enabled) {
        summary[entry.group].enabled.push(entry.name);
      } else {
        summary[entry.group].disabled.push(entry.name);
      }
    }
    return summary;
  }

  /**
   * Standard disabled message for tools that are turned off.
   */
  disabledMessage(name: string): string {
    const entry = this.tools.get(name);
    const group = entry?.group || 'unknown';
    return `⚠️ Tool "${name}" is currently DISABLED (group: ${group}). ` +
      `Use tool_toggle to enable it.`;
  }
}
