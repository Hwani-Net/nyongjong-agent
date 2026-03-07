#!/usr/bin/env node
/**
 * bulk-run-evals.ts
 * 52개 스킬 eval 일괄 실행 — KEEP/RETIRE/REVIEW 판정
 * 실행: npx tsx scripts/bulk-run-evals.ts
 */
import { readdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { homedir } from 'os';
import { runSkillEvalSuite } from '../src/core/skill-eval.js';

const SKILLS_DIR = resolve(homedir(), '.agent', 'skills');

async function main() {
  console.log('🔬 Bulk Eval Runner — 시작\n');

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillNames = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();

  console.log(`📦 총 ${skillNames.length}개 스킬 발견\n`);

  const results: Array<{
    skill: string;
    verdict: string;
    retirementSignal: boolean;
    totalEvals: number;
    report: string;
  }> = [];

  let keepCount = 0;
  let retireCount = 0;
  let reviewCount = 0;
  let noEvalCount = 0;

  for (const skillName of skillNames) {
    process.stdout.write(`  🔬 ${skillName.padEnd(36)} `);
    try {
      const summary = await runSkillEvalSuite(skillName);

      if (summary.totalEvals === 0) {
        noEvalCount++;
        process.stdout.write('⚠️  no-eval\n');
      } else {
        const emoji =
          summary.overallVerdict === 'KEEP'   ? '✅' :
          summary.overallVerdict === 'RETIRE'  ? '🔴' : '🟡';
        const signal = summary.retirementSignal ? ' ⚠️ 은퇴신호' : '';
        process.stdout.write(`${emoji} ${summary.overallVerdict}${signal}\n`);

        if (summary.overallVerdict === 'KEEP')   keepCount++;
        if (summary.overallVerdict === 'RETIRE')  retireCount++;
        if (summary.overallVerdict === 'REVIEW')  reviewCount++;
      }

      results.push({
        skill: skillName,
        verdict: summary.totalEvals === 0 ? 'NO_EVAL' : summary.overallVerdict,
        retirementSignal: summary.retirementSignal,
        totalEvals: summary.totalEvals,
        report: summary.report,
      });
    } catch (err) {
      process.stdout.write(`❌ ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      results.push({
        skill: skillName,
        verdict: 'ERROR',
        retirementSignal: false,
        totalEvals: 0,
        report: `ERROR: ${err}`,
      });
    }
  }

  // ─── 요약 출력 ───
  console.log('\n' + '─'.repeat(60));
  console.log('📊 최종 집계');
  console.log('─'.repeat(60));
  console.log(`✅ KEEP   : ${keepCount}개`);
  console.log(`🔴 RETIRE : ${retireCount}개`);
  console.log(`🟡 REVIEW : ${reviewCount}개`);
  console.log(`⚠️  NO_EVAL: ${noEvalCount}개`);
  console.log(`📦 합계   : ${skillNames.length}개\n`);

  // RETIRE 목록
  const retireCandidates = results.filter(r => r.verdict === 'RETIRE');
  if (retireCandidates.length > 0) {
    console.log('🔴 은퇴 후보 목록:');
    for (const r of retireCandidates) {
      console.log(`   - ${r.skill}${r.retirementSignal ? ' (은퇴신호 강함)' : ''}`);
    }
    console.log();
  }

  // ─── 결과 파일 저장 ───
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const outPath = resolve('eval-results', `bulk-eval-${timestamp}.md`);

  const mdLines = [
    `# 🔬 Bulk Eval 결과 — ${new Date().toLocaleString('ko-KR')}`,
    '',
    '## 집계',
    `| 판정 | 개수 |`,
    `|------|------|`,
    `| ✅ KEEP | ${keepCount} |`,
    `| 🔴 RETIRE | ${retireCount} |`,
    `| 🟡 REVIEW | ${reviewCount} |`,
    `| ⚠️ NO_EVAL | ${noEvalCount} |`,
    `| **합계** | **${skillNames.length}** |`,
    '',
    '## 스킬별 결과',
    '',
    '| 스킬 | 판정 | Eval 수 | 은퇴신호 |',
    '|------|------|---------|---------|',
    ...results.map(r => {
      const emoji =
        r.verdict === 'KEEP'    ? '✅' :
        r.verdict === 'RETIRE'  ? '🔴' :
        r.verdict === 'REVIEW'  ? '🟡' :
        r.verdict === 'NO_EVAL' ? '⚠️ ' : '❌';
      return `| ${r.skill} | ${emoji} ${r.verdict} | ${r.totalEvals} | ${r.retirementSignal ? '🔴 강함' : '-'} |`;
    }),
    '',
    '---',
    '',
    '## 상세 결과',
    '',
    ...results.filter(r => r.totalEvals > 0).map(r => r.report + '\n'),
  ];

  try {
    const { mkdir } = await import('fs/promises');
    await mkdir('eval-results', { recursive: true });
    await writeFile(outPath, mdLines.join('\n'), 'utf-8');
    console.log(`💾 결과 저장: ${outPath}`);
  } catch (err) {
    console.error('결과 파일 저장 실패:', err);
  }
}

main().catch(console.error);
