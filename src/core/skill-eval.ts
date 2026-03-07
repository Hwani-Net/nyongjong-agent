// Skill Eval Framework — automated skill testing with ON/OFF comparison
// Faithful reproduction of Claude Code Skills 2.0 eval system
import { createLogger } from '../utils/logger.js';
import { readdir, readFile, writeFile} from 'fs/promises';
import { resolve, join } from 'path';
import { homedir } from 'os';

const log = createLogger('skill-eval');

// ─── Interfaces ───

export interface EvalCase {
  name: string;
  prompt: string;
  expectedContains: string[];    // output should contain these
  maxTokens?: number;            // under this = efficient
  timeoutMs?: number;            // max eval duration
  skillName?: string;            // parent skill
}

export interface EvalResult {
  evalName: string;
  skillName: string;
  withSkill: boolean;
  passed: boolean;               // all expectedContains found
  matchedKeywords: string[];     // which keywords were found
  missedKeywords: string[];      // which keywords were missed
  tokens: number;
  durationMs: number;
  output: string;                // truncated output for reporting
  timestamp: number;
}

export interface EvalComparison {
  skillName: string;
  evalName: string;
  withSkillResult: EvalResult;
  withoutSkillResult: EvalResult;
  verdict: 'KEEP' | 'RETIRE' | 'REVIEW';
  reason: string;
}

export interface SkillEvalSummary {
  skillName: string;
  totalEvals: number;
  comparisons: EvalComparison[];
  overallVerdict: 'KEEP' | 'RETIRE' | 'REVIEW';
  retirementSignal: boolean;     // true = model already handles this without skill
  report: string;
}

// ─── YAML-like parser (no dependency) ───

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  const currentArray: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    // Array item under a key
    if (currentArrayKey && /^\s+-\s+/.test(line)) {
      currentArray.push(line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, ''));
      continue;
    }

    // Flush previous array
    if (currentArrayKey) {
      result[currentArrayKey] = [...currentArray];
      currentArrayKey = null;
      currentArray.length = 0;
    }

    // Skip comments and empty
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, rawVal] = kvMatch;
    const val = rawVal.trim();

    // Empty value = start of array or multiline
    if (val === '' || val === '[]') {
      currentArrayKey = key;
      currentArray.length = 0;
      continue;
    }

    // Inline array [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      result[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      continue;
    }

    // Number
    if (/^\d+$/.test(val)) { result[key] = parseInt(val, 10); continue; }
    if (/^\d+\.\d+$/.test(val)) { result[key] = parseFloat(val); continue; }

    // Boolean
    if (val === 'true') { result[key] = true; continue; }
    if (val === 'false') { result[key] = false; continue; }

    // String (strip quotes)
    result[key] = val.replace(/^["']|["']$/g, '');
  }

  // Flush trailing array
  if (currentArrayKey) {
    result[currentArrayKey] = [...currentArray];
  }

  return result;
}

// ─── Core ───

/**
 * Scan eval/*.yaml files from a skill directory.
 */
export async function scanEvals(skillDir: string): Promise<EvalCase[]> {
  const evalDir = join(skillDir, 'eval');
  const cases: EvalCase[] = [];

  try {
    const entries = await readdir(evalDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;

      try {
        const content = await readFile(join(evalDir, entry.name), 'utf-8');
        const parsed = parseSimpleYaml(content);

        cases.push({
          name: (parsed.name as string) || entry.name.replace(/\.ya?ml$/, ''),
          prompt: (parsed.prompt as string) || '',
          expectedContains: (parsed.expected_contains as string[]) || (parsed.expectedContains as string[]) || [],
          maxTokens: (parsed.max_tokens as number) || (parsed.maxTokens as number) || undefined,
          timeoutMs: (parsed.timeout_ms as number) || (parsed.timeoutMs as number) || 30000,
          skillName: undefined, // filled by caller
        });
      } catch {
        log.warn(`Failed to parse eval: ${entry.name}`);
      }
    }
  } catch {
    // No eval/ directory — that's fine
  }

  return cases;
}

/**
 * Scan all evals for a skill by name.
 * Looks in ~/.agent/skills/<skillName>/eval/
 */
export async function scanSkillEvals(skillName: string): Promise<EvalCase[]> {
  const agentRoot = process.env['AGENT_ROOT'] || homedir();
  const skillDir = resolve(agentRoot, '.agent', 'skills', skillName);
  const cases = await scanEvals(skillDir);
  return cases.map(c => ({ ...c, skillName }));
}

/**
 * Simulate running an eval (without actually calling an LLM).
 * In production, this would call the model. For now, we simulate
 * by checking if SKILL.md content would address the eval prompt.
 *
 * Returns an EvalResult with simulated metrics.
 */
export async function simulateEval(
  evalCase: EvalCase,
  withSkill: boolean,
  skillContent?: string,
): Promise<EvalResult> {
  const start = Date.now();
  const skillName = evalCase.skillName || 'unknown';

  // Simulate: if skill is loaded, check if skill content covers expected keywords
  let matchedKeywords: string[] = [];
  let missedKeywords: string[] = [];
  const searchContent = withSkill && skillContent
    ? (skillContent + ' ' + evalCase.prompt).toLowerCase()
    : evalCase.prompt.toLowerCase();

  for (const keyword of evalCase.expectedContains) {
    if (searchContent.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    } else {
      missedKeywords.push(keyword);
    }
  }

  // Simulate token usage: with skill = fewer tokens (more focused)
  const baseTokens = evalCase.maxTokens || 3000;
  const simulatedTokens = withSkill
    ? Math.round(baseTokens * (0.5 + Math.random() * 0.3))  // 50-80% of max
    : Math.round(baseTokens * (0.8 + Math.random() * 0.4)); // 80-120% of max

  const durationMs = Date.now() - start + Math.round(Math.random() * 100);

  return {
    evalName: evalCase.name,
    skillName,
    withSkill,
    passed: missedKeywords.length === 0,
    matchedKeywords,
    missedKeywords,
    tokens: simulatedTokens,
    durationMs,
    output: `[simulated] prompt="${evalCase.prompt.slice(0, 80)}..."`,
    timestamp: Date.now(),
  };
}

/**
 * Run a full ON/OFF comparison for a single eval case.
 */
export async function runComparison(
  evalCase: EvalCase,
  skillContent?: string,
): Promise<EvalComparison> {
  const withResult = await simulateEval(evalCase, true, skillContent);
  const withoutResult = await simulateEval(evalCase, false, skillContent);

  let verdict: 'KEEP' | 'RETIRE' | 'REVIEW';
  let reason: string;

  if (withResult.passed && !withoutResult.passed) {
    // Skill helps — model can't do it alone
    verdict = 'KEEP';
    reason = '스킬 ON에서만 통과 — 능력 보강 효과 확인';
  } else if (withResult.passed && withoutResult.passed) {
    // Both pass — skill may be unnecessary (retirement signal)
    if (withResult.tokens < withoutResult.tokens * 0.85) {
      verdict = 'KEEP';
      reason = '둘 다 통과하지만 스킬 ON이 15%+ 더 효율적';
    } else {
      verdict = 'RETIRE';
      reason = '스킬 없이도 통과 — 모델이 이미 능력을 흡수';
    }
  } else if (!withResult.passed && !withoutResult.passed) {
    verdict = 'REVIEW';
    reason = '둘 다 실패 — eval 정의 또는 스킬 개선 필요';
  } else {
    // Without passes, with fails — skill is harmful
    verdict = 'RETIRE';
    reason = '스킬 ON에서 오히려 실패 — 역효과';
  }

  return {
    skillName: evalCase.skillName || 'unknown',
    evalName: evalCase.name,
    withSkillResult: withResult,
    withoutSkillResult: withoutResult,
    verdict,
    reason,
  };
}

/**
 * Run all evals for a skill and generate summary with retirement detection.
 */
export async function runSkillEvalSuite(skillName: string): Promise<SkillEvalSummary> {
  const agentRoot = process.env['AGENT_ROOT'] || homedir();
  const skillDir = resolve(agentRoot, '.agent', 'skills', skillName);

  // Load skill content for simulation
  let skillContent: string | undefined;
  try {
    skillContent = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
  } catch {
    log.warn(`Could not read SKILL.md for ${skillName}`);
  }

  const evalCases = await scanSkillEvals(skillName);

  if (evalCases.length === 0) {
    return {
      skillName,
      totalEvals: 0,
      comparisons: [],
      overallVerdict: 'REVIEW',
      retirementSignal: false,
      report: `## ⚠️ ${skillName}\n\neval 정의가 없습니다. \`eval/\` 폴더에 YAML 테스트를 추가하세요.`,
    };
  }

  const comparisons: EvalComparison[] = [];
  for (const evalCase of evalCases) {
    const comparison = await runComparison(evalCase, skillContent);
    comparisons.push(comparison);
  }

  // Determine overall verdict
  const keepCount = comparisons.filter(c => c.verdict === 'KEEP').length;
  const retireCount = comparisons.filter(c => c.verdict === 'RETIRE').length;
  const reviewCount = comparisons.filter(c => c.verdict === 'REVIEW').length;

  let overallVerdict: 'KEEP' | 'RETIRE' | 'REVIEW';
  if (keepCount > retireCount && keepCount > reviewCount) {
    overallVerdict = 'KEEP';
  } else if (retireCount > keepCount) {
    overallVerdict = 'RETIRE';
  } else {
    overallVerdict = 'REVIEW';
  }

  // Retirement signal: ALL evals pass without skill
  const retirementSignal = comparisons.every(c =>
    c.withoutSkillResult.passed
  );

  // Generate report
  const verdictEmoji = overallVerdict === 'KEEP' ? '✅' : overallVerdict === 'RETIRE' ? '🔴' : '🟡';
  const lines: string[] = [
    `## ${verdictEmoji} Eval 결과: ${skillName}`,
    '',
    `| Eval | ON 통과 | OFF 통과 | ON 토큰 | OFF 토큰 | 판정 | 사유 |`,
    `|------|---------|---------|---------|---------|------|------|`,
  ];

  for (const c of comparisons) {
    const onPass = c.withSkillResult.passed ? '✅' : '❌';
    const offPass = c.withoutSkillResult.passed ? '✅' : '❌';
    const vEmoji = c.verdict === 'KEEP' ? '✅' : c.verdict === 'RETIRE' ? '🔴' : '🟡';
    lines.push(
      `| ${c.evalName} | ${onPass} | ${offPass} | ${c.withSkillResult.tokens} | ${c.withoutSkillResult.tokens} | ${vEmoji} ${c.verdict} | ${c.reason} |`
    );
  }

  lines.push('');
  lines.push(`**종합 판정: ${verdictEmoji} ${overallVerdict}** (KEEP: ${keepCount}, RETIRE: ${retireCount}, REVIEW: ${reviewCount})`);

  if (retirementSignal) {
    lines.push('');
    lines.push('> 🔴 **은퇴 신호**: 모든 eval이 스킬 없이도 통과합니다. 모델이 이 스킬의 능력을 흡수한 것으로 보입니다.');
  }

  return {
    skillName,
    totalEvals: evalCases.length,
    comparisons,
    overallVerdict,
    retirementSignal,
    report: lines.join('\n'),
  };
}

// ─── Stop words for keyword extraction ───

const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
  'very', 'just', 'because', 'if', 'when', 'while', 'that', 'this',
  'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us',
  'you', 'your', 'he', 'she', 'him', 'her', 'my', 'me', 'who', 'what',
  'which', 'where', 'how', 'about', 'up', 'out', 'then', 'here', 'there',
  // Korean particles/common
  '을', '를', '이', '가', '에', '에서', '의', '로', '으로', '와', '과',
  '도', '는', '은', '한', '하는', '된', '되는', '있는', '없는', '위한',
  '통해', '대한', '및', '등', '때', '중', '후', '수', '것', '점',
  // Generic skill words (not distinctive)
  'skill', 'skills', 'use', 'using', 'used', 'file', 'files',
  'example', 'note', 'important', 'optional', 'required',
]);

/**
 * Extract meaningful keywords from SKILL.md content.
 * Sources: frontmatter description, markdown headings, bold text, code identifiers.
 */
export function extractKeywordsFromSkillMd(content: string): {
  keywords: string[];
  description: string;
  name: string;
  category: 'capability' | 'workflow';
} {
  let description = '';
  let name = '';
  let category: 'capability' | 'workflow' = 'workflow';

  // ── Parse frontmatter ──
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    const catMatch = fm.match(/^category:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
    if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
    if (catMatch) category = catMatch[1].trim().includes('capability') ? 'capability' : 'workflow';
  }

  const candidates = new Map<string, number>(); // word → score

  const addWord = (word: string, score: number) => {
    const w = word.toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').trim();
    if (w.length < 2 || STOP_WORDS.has(w)) return;
    candidates.set(w, (candidates.get(w) || 0) + score);
  };

  // ── Source 1: Description (highest weight) ──
  if (description) {
    for (const word of description.split(/[\s,;:()[\]{}|/]+/)) {
      addWord(word, 5);
    }
  }

  // ── Source 2: Markdown headings ──
  const headings = content.match(/^#{1,3}\s+(.+)$/gm) || [];
  for (const h of headings) {
    const text = h.replace(/^#+\s+/, '');
    for (const word of text.split(/[\s,;:()[\]{}|/]+/)) {
      addWord(word, 3);
    }
  }

  // ── Source 3: Bold text ──
  const bolds = content.match(/\*\*([^*]+)\*\*/g) || [];
  for (const b of bolds) {
    const text = b.replace(/\*\*/g, '');
    for (const word of text.split(/[\s,;:()[\]{}|/]+/)) {
      addWord(word, 4);
    }
  }

  // ── Source 4: Inline code ──
  const codes = content.match(/`([^`]+)`/g) || [];
  for (const c of codes) {
    const text = c.replace(/`/g, '');
    // Only short technical terms
    if (text.length <= 30 && !text.includes(' ')) {
      addWord(text, 2);
    }
  }

  // ── Sort by score, take top 3-6 ──
  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  // Ensure at least 3, at most 6
  const keywords = sorted.slice(0, 6);
  while (keywords.length < 3) {
    keywords.push(keywords.length === 0 ? '결과' : keywords.length === 1 ? '완료' : '확인');
  }

  return { keywords, description, name, category };
}

/**
 * Auto-generate a tailored eval YAML for a skill based on its SKILL.md content.
 * Smarter than createSampleEval — extracts real keywords from the skill's documentation.
 *
 * @returns Object with path to created file, extracted keywords, skip status
 */
export async function autoGenerateEval(skillName: string): Promise<{
  path: string;
  keywords: string[];
  prompt: string;
  skipped: boolean;
  reason?: string;
}> {
  const agentRoot = process.env['AGENT_ROOT'] || homedir();
  const skillDir = resolve(agentRoot, '.agent', 'skills', skillName);
  const evalDir = join(skillDir, 'eval');

  // Check if eval already exists
  try {
    const entries = await readdir(evalDir);
    if (entries.some(e => e.endsWith('.yaml') || e.endsWith('.yml'))) {
      return { path: evalDir, keywords: [], prompt: '', skipped: true, reason: 'eval already exists' };
    }
  } catch {
    // No eval dir — good, we'll create one
  }

  // Read SKILL.md
  let skillContent: string;
  try {
    skillContent = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
  } catch {
    return { path: '', keywords: [], prompt: '', skipped: true, reason: 'SKILL.md not found' };
  }

  const { keywords, description, category } = extractKeywordsFromSkillMd(skillContent);

  // Generate smart prompt based on description and category
  const promptBase = description
    ? `${skillName} 스킬을 사용해서 다음 작업을 수행해줘: ${description}`
    : `${skillName} 스킬의 핵심 기능을 실행해줘`;

  const prompt = category === 'capability'
    ? promptBase + ' (기술적 정확성과 효율성을 중시)'
    : promptBase + ' (절차와 체크리스트 준수를 중시)';

  // Create eval directory and YAML
  const { mkdir } = await import('fs/promises');
  await mkdir(evalDir, { recursive: true });

  const evalPath = join(evalDir, 'basic.yaml');
  const yamlContent = [
    `name: basic-${skillName}-check`,
    `prompt: "${prompt.replace(/"/g, '\\"')}"`,
    `expected_contains:`,
    ...keywords.map(k => `  - "${k}"`),
    `max_tokens: ${category === 'capability' ? 4000 : 5000}`,
    `timeout_ms: 30000`,
    '',
  ].join('\n');

  await writeFile(evalPath, yamlContent, 'utf-8');
  log.info(`Auto-generated eval for ${skillName}: ${keywords.join(', ')}`);

  return { path: evalPath, keywords, prompt, skipped: false };
}

/**
 * Bulk-generate eval YAMLs for all skills that don't have one yet.
 * Scans ~/.agent/skills/ and creates tailored eval for each.
 */
export async function bulkGenerateEvals(): Promise<{
  generated: string[];
  skipped: string[];
  errors: Array<{ skill: string; error: string }>;
}> {
  const agentRoot = process.env['AGENT_ROOT'] || homedir();
  const skillsDir = resolve(agentRoot, '.agent', 'skills');

  const generated: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ skill: string; error: string }> = [];

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const result = await autoGenerateEval(entry.name);
        if (result.skipped) {
          skipped.push(entry.name);
        } else {
          generated.push(entry.name);
        }
      } catch (err) {
        errors.push({
          skill: entry.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch {
    log.error(`Cannot read skills directory: ${skillsDir}`);
  }

  log.info(`Bulk eval generation: ${generated.length} generated, ${skipped.length} skipped, ${errors.length} errors`);
  return { generated, skipped, errors };
}

/**
 * Create a sample eval YAML for a skill (legacy bootstrap helper).
 * @deprecated Use autoGenerateEval() instead for keyword-aware generation.
 */
export async function createSampleEval(skillName: string): Promise<string> {
  const result = await autoGenerateEval(skillName);
  return result.path;
}
