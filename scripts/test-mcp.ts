// MCP connection test script — verifies the server starts and responds
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../src/utils/logger.js';

const log = createLogger('test-mcp');

async function testMcpConnection(): Promise<void> {
  log.info('━━━ MCP Connection Test ━━━');

  try {
    // Create client transport
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/index.ts'],
      env: {
        ...process.env,
        OBSIDIAN_VAULT_PATH: process.env.OBSIDIAN_VAULT_PATH || 'e:/Agent/뇽죵이Agent/data',
        AGENT_DATA_DIR: '.',
        OLLAMA_URL: 'http://localhost:11434',
        LOG_LEVEL: 'warn',
        MCP_TRANSPORT: 'stdio',
      },
    });

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
    log.info('✅ Connected to MCP server');

    // List available tools
    const tools = await client.listTools();
    log.info(`✅ Found ${tools.tools.length} tools:`);
    for (const tool of tools.tools) {
      log.info(`   📌 ${tool.name}: ${tool.description}`);
    }

    // Test: agent_status
    log.info('\n━━━ Testing agent_status ━━━');
    const statusResult = await client.callTool({ name: 'agent_status', arguments: {} });
    log.info('Response:', JSON.stringify(statusResult.content, null, 2));

    // Test: analyze_goal
    log.info('\n━━━ Testing analyze_goal ━━━');
    const goalResult = await client.callTool({
      name: 'analyze_goal',
      arguments: { goal: '새로운 로그인 페이지 UI를 만들어줘' },
    });
    log.info('Response:', JSON.stringify(goalResult.content, null, 2));

    // Test: ground_check
    log.info('\n━━━ Testing ground_check ━━━');
    const groundResult = await client.callTool({
      name: 'ground_check',
      arguments: { text: '한국 GDP는 약 2,000조원이며, 실업률은 3.5%입니다.' },
    });
    log.info('Response:', JSON.stringify(groundResult.content, null, 2));

    // Test: list_models
    log.info('\n━━━ Testing list_models ━━━');
    const modelsResult = await client.callTool({ name: 'list_models', arguments: {} });
    log.info('Response:', JSON.stringify(modelsResult.content, null, 2));

    await client.close();
    log.info('\n━━━ All MCP tests passed! ━━━');

  } catch (error) {
    log.error('MCP connection test failed:', error);
    process.exit(1);
  }
}

testMcpConnection();
