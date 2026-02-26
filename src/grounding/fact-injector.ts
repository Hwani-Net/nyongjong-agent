// Fact injector — injects verified facts into persona responses
import { createLogger } from '../utils/logger.js';
import type { GroundingResult, ClaimVerification } from './grounding-engine.js';

const log = createLogger('fact-injector');

export interface InjectionResult {
  /** Original text with facts injected */
  injectedText: string;
  /** Number of facts injected */
  factCount: number;
  /** Summary of injections made */
  summary: string;
}

/**
 * Fact Injector — takes grounding verification results and injects
 * verified facts back into the original persona response text.
 *
 * Design doc Section 6.3:
 *   페르소나 응답 → Antigravity 분석 → "가격 추측 감지"
 *   → API 호출 → 실제 데이터 반환
 *   → 팩트 주입
 *   → 보고서: "페르소나는 월 5,000원 예상 → 실제 시장가 3,900~9,900원"
 */
export function injectFacts(
  originalText: string,
  groundingResult: GroundingResult,
): InjectionResult {
  log.info('Injecting facts into persona response', {
    verifications: groundingResult.verifications.length,
  });

  if (groundingResult.verifications.length === 0) {
    return {
      injectedText: originalText,
      factCount: 0,
      summary: 'No facts to inject.',
    };
  }

  let injectedText = originalText;
  const injectionNotes: string[] = [];

  for (const verification of groundingResult.verifications) {
    if (!verification.verified) continue;

    const annotation = buildAnnotation(verification);
    if (annotation) {
      // Insert fact annotation after the claim in the text
      const claimPos = injectedText.indexOf(verification.claim.text);
      if (claimPos >= 0) {
        const insertAt = claimPos + verification.claim.text.length;
        injectedText =
          injectedText.slice(0, insertAt) +
          ` [📊 ${annotation}]` +
          injectedText.slice(insertAt);

        injectionNotes.push(
          `"${verification.claim.text}" → ${annotation}`,
        );
      }
    }
  }

  const factCount = injectionNotes.length;
  const summary = factCount > 0
    ? `${factCount} facts injected:\n${injectionNotes.map((n) => `  - ${n}`).join('\n')}`
    : 'Grounding data found but could not inject into text.';

  log.info(summary);

  return { injectedText, factCount, summary };
}

/**
 * Build a human-readable annotation from a verification result.
 */
function buildAnnotation(verification: ClaimVerification): string | null {
  const { claim, apiResult } = verification;

  if (!apiResult.success || !apiResult.data) return null;

  // Truncate long API data
  const dataPreview = apiResult.data.length > 100
    ? apiResult.data.slice(0, 100) + '...'
    : apiResult.data;

  switch (claim.type) {
    case 'statistic':
      return `실제 통계: ${dataPreview} (출처: ${apiResult.source})`;
    case 'price':
      return `실제 가격: ${dataPreview} (출처: ${apiResult.source})`;
    case 'regulation':
      return `법령 확인: ${dataPreview} (출처: ${apiResult.source})`;
    case 'date':
      return `날짜 확인: ${dataPreview} (출처: ${apiResult.source})`;
    case 'name':
      return `확인: ${dataPreview} (출처: ${apiResult.source})`;
    default:
      return `검증됨: ${dataPreview} (출처: ${apiResult.source})`;
  }
}
