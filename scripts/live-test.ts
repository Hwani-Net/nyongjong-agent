/**
 * 방향 B — 실전 사용 테스트 스크립트
 *
 * Dashboard 서버가 :3100 에서 실행 중일 때 실제 API 엔드포인트를 호출합니다.
 * run_cycle → Gate History 반영 → Cache Stats 확인
 *
 * Run: npx tsx scripts/live-test.ts
 * Prereq: npx tsx src/dashboard-main.ts 가 실행 중이어야 함
 */

const BASE = 'http://localhost:3100';

// ── Helpers ──

function section(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function ok(msg: string)   { console.log(`  ✅ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠️  ${msg}`); }
function fail(msg: string, detail?: unknown) {
  console.error(`  ❌ ${msg}`);
  if (detail) console.error('    ', detail);
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Test 1: 서버 연결 확인 ──

async function test1_serverHealth() {
  section('Test 1: 서버 연결 확인 (/health)');
  const { status, body } = await get('/health');

  console.log(`  HTTP: ${status}`);
  console.log(`  status: ${body.status}`);
  console.log(`  version: ${body.version}`);
  console.log(`  uptime: ${body.uptime}s`);
  console.log(`  modules: ${JSON.stringify(body.modules)}`);

  if (status !== 200 && status !== 503) {
    fail(`Unexpected HTTP status: ${status}`); return false;
  }
  if (!body.status) {
    fail('No status field'); return false;
  }
  if (!body.version || body.version === 'unknown') {
    warn('version = unknown (package.json 읽기 실패?)');
  } else {
    ok(`version = ${body.version}`);
  }

  if (body.status === 'ok') {
    ok('/health → ok');
  } else if (body.status === 'degraded') {
    warn(`/health → degraded (issues: ${(body.issues || []).join(', ')})`);
  }

  return true;
}

// ── Test 2: /api/status ──

async function test2_status() {
  section('Test 2: Agent Status (/api/status)');
  const { status, body } = await get('/api/status');

  console.log(`  HTTP: ${status}`);
  console.log(`  tools: ${(body.tools || []).length}개`);
  console.log(`  enabledTools: ${(body.enabledTools || []).length}개`);
  console.log(`  personas: ${(body.personas || []).length}개`);
  console.log(`  ollama: ${body.ollama?.available ? '연동됨' : '미연동'}`);

  // Cache 히트율 확인
  const cache = body.cache;
  if (cache != null) {
    console.log(`  cache.hitRate: ${cache.hitRate ?? '—'}%`);
    console.log(`  cache.fileCount: ${cache.fileCount ?? '—'}`);
    ok('cache 객체 존재 — Dashboard csHitRate 실제 데이터 표시 가능');
  } else {
    warn('cache 필드 없음 — Dashboard csHitRate = 0% 로 폴백됨');
  }

  // Gate history
  const gates = body.gateHistory || [];
  console.log(`  gateHistory: ${gates.length}건`);

  if (status !== 200) { fail(`Unexpected status: ${status}`); return false; }
  if (!body.tools) { fail('tools 필드 없음'); return false; }

  ok('/api/status 정상');
  return true;
}

// ── Test 3: Gate History API ──

async function test3_gateHistory() {
  section('Test 3: Gate History (/api/gate-history)');
  const { status, body } = await get('/api/gate-history');

  console.log(`  HTTP: ${status}`);
  console.log(`  기록 수: ${Array.isArray(body) ? body.length : '(배열 아님)'}`);

  if (Array.isArray(body) && body.length > 0) {
    body.slice(0, 3).forEach((h: {verdict:string;goal:string;time:string}) => {
      const icon = h.verdict === 'PASS' ? '✅' : h.verdict === 'SKIP' ? '⏭️' : h.verdict === 'PIVOT' ? '🔄' : '❌';
      console.log(`    ${icon} [${h.verdict}] ${h.goal.slice(0, 50)} (${h.time})`);
    });
    ok('Gate History 데이터 있음');
  } else {
    warn('Gate History 비어 있음 — MCP run_cycle 호출 후 다시 확인');
  }

  if (status !== 200) { fail(`Unexpected status: ${status}`); return false; }
  ok('/api/gate-history 정상');
  return true;
}

// ── Test 4: Error Log API ──

async function test4_errorLog() {
  section('Test 4: Error Log (/api/errors)');
  const { status, body } = await get('/api/errors');

  console.log(`  HTTP: ${status}`);
  const logs = body.logs || [];
  console.log(`  에러 로그 수: ${logs.length}`);
  if (logs.length > 0) {
    logs.slice(0, 3).forEach((e: {level:string;message:string;time:string}) => {
      const icon = e.level === 'error' ? '🔴' : '🟡';
      console.log(`    ${icon} [${(e.level || 'warn').toUpperCase()}] ${(e.message||'').slice(0,70)}`);
    });
  } else {
    ok('에러 로그 0건 — 깨끗한 상태');
  }

  if (status !== 200) { fail(`Unexpected status: ${status}`); return false; }
  ok('/api/errors 정상');
  return true;
}

// ── Test 5: Chat API (뇽죵이 응답 테스트) ──

async function test5_chat() {
  section('Test 5: Chat API (/api/chat)');
  const { status, body } = await post('/api/chat', { message: '현재 상태를 알려줘' });

  console.log(`  HTTP: ${status}`);
  console.log(`  action: ${body.action}`);
  console.log(`  reply: ${(body.reply || '').slice(0, 100)}...`);

  if (status !== 200) { fail(`Unexpected status: ${status}`); return false; }
  if (!body.reply) { fail('reply 필드 없음'); return false; }

  ok('Chat API 응답 정상');
  return true;
}

// ── Test 6: MCP Tools API ──

async function test6_tools() {
  section('Test 6: MCP Tools 목록 확인');
  const { status, body } = await get('/api/status');

  const tools: Array<{name:string;enabled:boolean;group:string}> = body.tools || [];
  const groups: Record<string, string[]> = {};
  tools.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t.enabled ? `✅ ${t.name}` : `○ ${t.name}`);
  });

  console.log(`\n  총 ${tools.length}개 도구:`);
  Object.entries(groups).forEach(([g, tList]) => {
    console.log(`\n  📦 [${g}]`);
    tList.forEach(t => console.log(`    ${t}`));
  });

  const enabledCount = tools.filter(t => t.enabled).length;
  console.log(`\n  활성화: ${enabledCount}/${tools.length}`);

  // Stage-Gate 도구 확인
  const gateTool = tools.find(t => t.name === 'business_gate');
  const prdTool = tools.find(t => t.name === 'prd_elicit');
  if (gateTool?.enabled) ok('business_gate 활성화 ✅');
  else warn('business_gate 비활성화 또는 없음');
  if (prdTool?.enabled) ok('prd_elicit 활성화 ✅');
  else warn('prd_elicit 비활성화 또는 없음');

  if (status !== 200) { fail(`Unexpected status: ${status}`); return false; }
  ok(`MCP Tools ${enabledCount}/${tools.length} 활성화 확인`);
  return true;
}

// ── 최종 요약 ──

async function main() {
  console.log('\n🔍 뇽죵이 Agent — 실전 사용 테스트 (방향 B)');
  console.log(`   대상 서버: ${BASE}`);
  console.log('   사전 조건: npx tsx src/dashboard-main.ts 실행 중');
  console.log(`   시간: ${new Date().toLocaleString('ko-KR')}`);

  // 서버 기동 확인
  try {
    await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`\n❌ 서버 연결 실패 — ${BASE} 에 뇽죵이 Dashboard가 실행 중인지 확인하세요`);
    process.exit(1);
  }

  interface Result { name: string; passed: boolean }
  const results: Result[] = [];

  const tests: Array<{name:string; fn: ()=>Promise<boolean>}> = [
    { name: 'Test 1: /health',           fn: test1_serverHealth },
    { name: 'Test 2: /api/status',       fn: test2_status },
    { name: 'Test 3: /api/gate-history', fn: test3_gateHistory },
    { name: 'Test 4: /api/errors',       fn: test4_errorLog },
    { name: 'Test 5: /api/chat',         fn: test5_chat },
    { name: 'Test 6: MCP Tools',         fn: test6_tools },
  ];

  for (const t of tests) {
    try {
      const passed = await t.fn();
      results.push({ name: t.name, passed });
    } catch (err) {
      console.error(`\n  ❌ ${t.name} 예외:`, err);
      results.push({ name: t.name, passed: false });
    }
  }

  section('📊 실전 테스트 요약');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (!r.passed) allPassed = false;
  }

  const passCount = results.filter(r => r.passed).length;
  console.log(`\n  결과: ${passCount}/${results.length} 통과`);

  if (!allPassed) {
    console.log('\n  💡 실패 항목은 서버 재시작 또는 ENV 확인 후 재실행하세요');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
