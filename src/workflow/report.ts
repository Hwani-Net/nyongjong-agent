// Workflow stage 5: Report — generate human-readable report for the CEO
import { createLogger } from '../utils/logger.js';
import type { ValidationResult } from './validate.js';
import type { EvolveOutput } from './evolve.js';
import type { SimulationResult } from '../personas/persona-simulator.js';

const log = createLogger('workflow:report');

export interface ReportInput {
  /** Original user goal */
  goal: string;
  /** Goal analysis from Understand stage */
  analysis: {
    taskType: string;
    complexity: string;
    keyRequirements: string[];
    risks: string[];
  };
  /** Validation result */
  validation: ValidationResult;
  /** Evolution history (if retries occurred) */
  evolutionHistory?: EvolveOutput[];
  /** Persona consultation results */
  personaResults?: SimulationResult[];
  /** Total cycle duration */
  totalDurationMs: number;
  /** Number of cycle iterations */
  cycleIterations: number;
  /** Gate 0 verdict (if ran) */
  businessGateVerdict?: string;
  /** Gate 1 PRD version + satisfied (if ran) */
  prdResult?: { version: number; rounds: number; allSatisfied: boolean };
  /** Whether gates were force-enabled */
  forceGates?: boolean;
  /** ADR-014: Team Lead review result */
  teamLeadReview?: {
    verdict: 'PASS' | 'WARN' | 'BLOCK';
    attempts: number;
    reviewSummary: string;
  };
  /** ADR-014: Browser visual check result */
  visualCheck?: {
    passed: boolean;
    notes: string;
    screenshotPath?: string;
  };
}

export interface Report {
  /** Report title */
  title: string;
  /** Markdown-formatted report content */
  markdown: string;
  /** Status emoji */
  status: '✅' | '⚠️' | '❌';
  /** Recommended next model */
  recommendedModel: string;
  /** Recommended next action */
  nextAction: string;
}

/**
 * Stage 5: Report — generate a structured report for the CEO.
 *
 * The report includes:
 * - What was done
 * - Validation results
 * - Persona insights
 * - Next steps recommendation
 */
export function generateReport(input: ReportInput): Report {
  const {
    goal,
    analysis,
    validation,
    evolutionHistory,
    personaResults,
    totalDurationMs,
    cycleIterations,
  } = input;

  log.info('Generating report');

  const status = validation.passed ? '✅' : (evolutionHistory?.some(e => e.escalateToHuman) ? '❌' : '⚠️');
  const title = `${status} ${goal.slice(0, 60)}${goal.length > 60 ? '...' : ''}`;
  const durationStr = formatDuration(totalDurationMs);

  const sections: string[] = [];

  // Header
  sections.push(`# ${title}`);
  sections.push('');
  sections.push(`> 소요 시간: ${durationStr} | 반복 횟수: ${cycleIterations} | 유형: ${analysis.taskType} (${analysis.complexity})`);
  sections.push('');

  // Gate 0 / Gate 1 결과 (forceGates 또는 REQUIRED 시에만)
  if (input.businessGateVerdict || input.prdResult) {
    sections.push('## 🚦 Gate 실행 결과');
    if (input.forceGates) {
      sections.push('> ⚡ forceGates=true — complexity 무관 강제 실행 (/자율 모드)');
    }
    if (input.businessGateVerdict) {
      const gIcon = input.businessGateVerdict === 'PASS' ? '✅' : input.businessGateVerdict === 'PIVOT' ? '🔄' : '❌';
      sections.push(`- Gate 0 (사업성): ${gIcon} ${input.businessGateVerdict}`);
    } else {
      sections.push('- Gate 0 (사업성): ⏭️ SKIP');
    }
    if (input.prdResult) {
      const pIcon = input.prdResult.allSatisfied ? '✅' : '⚠️';
      sections.push(`- Gate 1 (PRD): ${pIcon} v${input.prdResult.version} (${input.prdResult.rounds}라운드, ${input.prdResult.allSatisfied ? '전원 만족' : '일부 불만 잔존'})`);
    } else {
      sections.push('- Gate 1 (PRD): ⏭️ SKIP');
    }
    sections.push('');
  }

  // Validation results
  sections.push('## 검증 결과');
  for (const check of validation.checks) {
    sections.push(`- ${check.passed ? '✅' : '❌'} \`${check.name}\` (${check.durationMs}ms)`);
  }
  sections.push('');

  // ADR-014: Team Lead Review
  if (input.teamLeadReview) {
    const { verdict, attempts, reviewSummary } = input.teamLeadReview;
    const rIcon = verdict === 'PASS' ? '✅' : verdict === 'WARN' ? '⚠️' : '❌';
    sections.push('## 👨‍💻 팀장 코드 리뷰');
    sections.push(`- **판정**: ${rIcon} ${verdict} (${attempts}회 시도)`);
    sections.push(`- **요약**: ${reviewSummary.slice(0, 300)}${reviewSummary.length > 300 ? '...' : ''}`);
    sections.push('');
  }

  // ADR-014: Browser Visual Check
  if (input.visualCheck) {
    const vIcon = input.visualCheck.passed ? '✅' : '❌';
    sections.push('## 🖥️ 브라우저 시각 검증');
    sections.push(`- **결과**: ${vIcon} ${input.visualCheck.passed ? '통과' : '불합격'}`);
    sections.push(`- **메모**: ${input.visualCheck.notes}`);
    if (input.visualCheck.screenshotPath) {
      sections.push(`- **스크린샷**: ${input.visualCheck.screenshotPath}`);
    }
    sections.push('');
  }

  // Issues (if any)
  if (validation.issues.length > 0) {
    sections.push('## ⚠️ 이슈');
    validation.issues.forEach((issue) => sections.push(`- ${issue}`));
    sections.push('');
  }

  // Auto-injected warnings (npm outdated, drift-guard)
  if (validation.warnings && validation.warnings.length > 0) {
    sections.push('## 📦 자동 점검 경고');
    validation.warnings.forEach((w) => sections.push(`- ${w}`));
    sections.push('');
  }


  // Evolution history (if retries occurred)
  if (evolutionHistory && evolutionHistory.length > 0) {
    sections.push('## 🔄 진화 이력');
    evolutionHistory.forEach((evo, i) => {
      sections.push(`### 시도 ${i + 1}`);
      sections.push(evo.notes);
      if (evo.fixes.length > 0) {
        evo.fixes.forEach((fix) => {
          sections.push(`- ${fix.description} (${fix.confidence})`);
        });
      }
    });
    sections.push('');
  }

  // Persona insights
  if (personaResults && personaResults.length > 0) {
    sections.push('## 🎭 페르소나 자문');
    personaResults.forEach((result) => {
      sections.push(`### ${result.persona} (${result.model})`);
      sections.push(result.response.slice(0, 300));
      sections.push('');
    });
  }

  // Recommendations
  const recommendedModel = analysis.complexity === 'critical'
    ? 'Claude Opus 4.6 (Thinking)'
    : analysis.complexity === 'high'
    ? 'Gemini 3.1 Pro (High)'
    : analysis.complexity === 'medium'
    ? 'Gemini 3.1 Pro (Low)'
    : 'Gemini 3 Flash';

  const nextAction = validation.passed
    ? '다음 기능 구현 또는 배포'
    : '이슈 수정 후 재검증';

  sections.push('## 📌 다음 추천');
  sections.push(`- 모델: \`${recommendedModel}\``);
  sections.push(`- 작업: ${nextAction}`);

  const markdown = sections.join('\n');

  log.info(`Report generated: ${status} (${durationStr})`);

  return {
    title,
    markdown,
    status,
    recommendedModel,
    nextAction,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}
