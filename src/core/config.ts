// Core configuration loader with validation
import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

const ConfigSchema = z.object({
  // Obsidian Local REST API
  OBSIDIAN_API_URL: z.string().url().default('http://127.0.0.1:27123'),
  OBSIDIAN_API_KEY: z.string().min(1, 'OBSIDIAN_API_KEY is required'),

  // Agent data directory inside the vault (relative path)
  AGENT_DATA_DIR: z.string().default('뇽죵이Agent'),

  // Ollama server URL
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),

  // Log level
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // MCP transport type
  MCP_TRANSPORT: z.enum(['stdio', 'sse']).default('stdio'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;

/**
 * Load and validate configuration from environment variables.
 * Results are cached after first successful load.
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  loadDotenv({ path: resolve(process.cwd(), '.env') });

  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}



/**
 * Reset cached config (useful for testing).
 */
export function resetConfig(): void {
  cachedConfig = null;
}
