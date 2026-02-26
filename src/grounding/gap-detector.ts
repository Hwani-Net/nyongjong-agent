// Gap detector — identifies factual claims that need verification
import { createLogger } from '../utils/logger.js';

const log = createLogger('gap-detector');

export interface FactualClaim {
  /** The text containing the claim */
  text: string;
  /** Type of claim */
  type: 'statistic' | 'date' | 'name' | 'regulation' | 'price' | 'general';
  /** Confidence that this needs grounding (0-1) */
  groundingNeed: number;
  /** Suggested data source */
  suggestedSource: string;
}

export interface GapAnalysis {
  /** Original text analyzed */
  originalText: string;
  /** Detected factual claims */
  claims: FactualClaim[];
  /** Overall grounding score (0-1, higher = more grounding needed) */
  overallScore: number;
  /** Summary */
  summary: string;
}

// Patterns that indicate factual claims needing verification
const STAT_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(%|percent|퍼센트)/gi,
  /(\d{1,3}(?:,\d{3})*)\s*(명|건|원|개|대|달러|만|억|조)/gi,
  /약\s*\d+/gi,
  /전년\s*(대비|비)\s*\d+/gi,
];

const DATE_PATTERNS = [
  /\d{4}년\s*\d{1,2}월/gi,
  /20\d{2}[-/]\d{1,2}/gi,
  /최근\s*\d+\s*(년|개월|주)/gi,
];

const REGULATION_PATTERNS = [
  /법률? *제? *\d+/gi,
  /시행령|시행규칙|고시|훈령/gi,
  /[\uAC00-\uD7A3]+법[^\uAC00-\uD7A3]/gi,
];

const PRICE_PATTERNS = [
  /\d+(?:,\d{3})* *원/gi,
  /\$\d+(?:,\d{3})*(?:\.\d{2})?/gi,
  /시가총액|매출액|영업이익/gi,
];

/**
 * Analyze text for factual claims that may need external data grounding.
 */
export function detectGaps(text: string): GapAnalysis {
  log.info('Detecting factual gaps', { textLength: text.length });

  const claims: FactualClaim[] = [];

  // Check for statistics
  for (const pattern of STAT_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'statistic',
        groundingNeed: 0.9,
        suggestedSource: 'KOSIS/통계청',
      });
    }
  }

  // Check for dates
  for (const pattern of DATE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'date',
        groundingNeed: 0.6,
        suggestedSource: 'general',
      });
    }
  }

  // Check for regulations
  for (const pattern of REGULATION_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'regulation',
        groundingNeed: 0.95,
        suggestedSource: '법제처/국가법령정보센터',
      });
    }
  }

  // Check for prices
  for (const pattern of PRICE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'price',
        groundingNeed: 0.85,
        suggestedSource: 'data.go.kr/공공데이터',
      });
    }
  }

  // Deduplicate by text
  const unique = new Map<string, FactualClaim>();
  for (const claim of claims) {
    const key = claim.text.trim();
    if (!unique.has(key) || unique.get(key)!.groundingNeed < claim.groundingNeed) {
      unique.set(key, claim);
    }
  }

  const uniqueClaims = Array.from(unique.values());
  const overallScore = uniqueClaims.length > 0
    ? uniqueClaims.reduce((sum, c) => sum + c.groundingNeed, 0) / uniqueClaims.length
    : 0;

  const summary = uniqueClaims.length === 0
    ? 'No factual claims detected that need grounding.'
    : `Found ${uniqueClaims.length} factual claims that may need verification.`;

  log.info(`Gap detection: ${uniqueClaims.length} claims, score ${overallScore.toFixed(2)}`);

  return {
    originalText: text,
    claims: uniqueClaims,
    overallScore,
    summary,
  };
}
