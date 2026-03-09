#!/usr/bin/env tsx
/**
 * 뇽죵이Agent Health Check CLI
 * Obsidian REST API, Ollama, 환경변수 상태를 한눈에 진단
 * 
 * Usage: npx tsx scripts/health-check.ts
 */

import { config } from 'dotenv';
config();

// ── Types ──
interface CheckResult {
  name: string;
  status: '✅' | '⚠️' | '❌';
  detail: string;
  latencyMs?: number;
}

// ── Health Checks ──

async function checkObsidian(): Promise<CheckResult> {
  const url = process.env.OBSIDIAN_REST_URL || 'http://localhost:27124';
  const token = process.env.OBSIDIAN_API_KEY;

  if (!token) {
    return { name: 'Obsidian REST API', status: '⚠️', detail: 'OBSIDIAN_API_KEY 환경변수 미설정' };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${url}/`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { name: 'Obsidian REST API', status: '✅', detail: `연결 성공 (${url})`, latencyMs };
    }
    return { name: 'Obsidian REST API', status: '❌', detail: `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    return { name: 'Obsidian REST API', status: '❌', detail: `연결 실패: ${(err as Error).message}` };
  }
}

async function checkOllama(): Promise<CheckResult> {
  const url = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const start = Date.now();

  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const modelCount = data.models?.length ?? 0;
      return { name: 'Ollama', status: '✅', detail: `실행 중 — ${modelCount}개 모델 로드됨`, latencyMs };
    }
    return { name: 'Ollama', status: '❌', detail: `HTTP ${res.status}`, latencyMs };
  } catch {
    return { name: 'Ollama', status: '❌', detail: '미실행 또는 연결 불가' };
  }
}

function checkEnvVars(): CheckResult {
  const required = ['OBSIDIAN_API_KEY'];
  const optional = ['OLLAMA_HOST', 'OBSIDIAN_REST_URL', 'TAVILY_API_KEY', 'OPENAI_API_KEY'];

  const missingRequired = required.filter(k => !process.env[k]);
  const setOptional = optional.filter(k => process.env[k]);

  if (missingRequired.length > 0) {
    return {
      name: '환경변수',
      status: '⚠️',
      detail: `필수 누락: ${missingRequired.join(', ')} | 선택 설정됨: ${setOptional.length}/${optional.length}`,
    };
  }
  return {
    name: '환경변수',
    status: '✅',
    detail: `필수 전부 설정 | 선택 설정됨: ${setOptional.length}/${optional.length}`,
  };
}

function checkNodeVersion(): CheckResult {
  const major = parseInt(process.version.slice(1), 10);
  if (major >= 22) {
    return { name: 'Node.js', status: '✅', detail: `${process.version} (≥22 충족)` };
  }
  return { name: 'Node.js', status: '❌', detail: `${process.version} — Node.js ≥22 필요` };
}

// ── Main ──

async function main() {
  console.log('');
  console.log('🐸 뇽죵이Agent 헬스 체크');
  console.log('━'.repeat(45));

  const checks = await Promise.all([
    checkNodeVersion(),
    checkEnvVars(),
    checkObsidian(),
    checkOllama(),
  ]);

  for (const c of checks) {
    const latency = c.latencyMs ? ` (${c.latencyMs}ms)` : '';
    console.log(`${c.status} ${c.name.padEnd(20)} ${c.detail}${latency}`);
  }

  console.log('━'.repeat(45));

  const failCount = checks.filter(c => c.status === '❌').length;
  const warnCount = checks.filter(c => c.status === '⚠️').length;

  if (failCount > 0) {
    console.log(`❌ ${failCount}개 실패, ${warnCount}개 경고`);
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(`⚠️ ${warnCount}개 경고 — 동작은 가능하나 확인 필요`);
  } else {
    console.log('✅ 모든 체크 통과 — 준비 완료!');
  }
  console.log('');
}

main().catch(err => {
  console.error('❌ 헬스 체크 실행 오류:', err);
  process.exit(1);
});
