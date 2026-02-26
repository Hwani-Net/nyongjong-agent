import { spawn } from 'child_process';

const child = spawn('node', ['dist/index.js'], {
  cwd: 'e:/Agent/nongjong-agent',
  env: {
    ...process.env,
    OBSIDIAN_VAULT_PATH: 'e:/Agent/nongjong-agent/data',
    AGENT_DATA_DIR: 'E:/Agent/nongjong-agent',
    OLLAMA_URL: 'http://localhost:11434',
    LOG_LEVEL: 'error',
    MCP_TRANSPORT: 'stdio'
  }
});

let stdoutData = '';

child.stdout.on('data', (data) => {
  stdoutData += data.toString();
});

setTimeout(() => {
  // Test 1: persona_list
  const req1 = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'persona_list', arguments: {} }
  }) + '\n';
  
  // Test 2: analyze_goal
  const req2 = JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'analyze_goal', arguments: { goal: 'Test the agent stability' } }
  }) + '\n';

  child.stdin.write(req1);
  child.stdin.write(req2);
}, 2000);

setTimeout(() => {
  child.kill();
  console.log('--- STDOUT ---');
  console.log(stdoutData);
}, 5000);
