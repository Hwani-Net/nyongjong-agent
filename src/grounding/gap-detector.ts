// Gap detector — identifies factual claims that need verification
import { createLogger } from '../utils/logger.js';

const log = createLogger('gap-detector');

export interface FactualClaim {
  /** The text containing the claim */
  text: string;
  /** Type of claim — matches design doc Section 6.1 */
  type: 'statistic' | 'date' | 'name' | 'regulation' | 'price' | 'trend' | 'user_behavior' | 'competitor' | 'general';
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
        suggestedSource: '네이버쇼핑/쿠팡',
      });
    }
  }

  // Check for trends (design doc Section 6.1: "트렌드가...")
  const TREND_PATTERNS = [
    /트렌드[가는이].{0,30}/g,
    /검색량[이가].{0,30}/g,
    /인기[가는이].{0,20}(증가|감소|상승|하락)/g,
    /최근\s+\d+년간?.{0,30}(성장|증가|감소)/g,
  ];
  for (const pattern of TREND_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'trend',
        groundingNeed: 0.8,
        suggestedSource: 'Google Trends/Naver DataLab',
      });
    }
  }

  // Check for user behavior claims (design doc Section 6.1: "사용자들은 보통...")
  const USER_BEHAVIOR_PATTERNS = [
    /사용자[들은는이가].{0,20}(보통|대부분|주로|평균)/g,
    /이용자[들은는이가].{0,30}/g,
    /다운로드.{0,10}\d+[\s]*(만|천|백만)/g,
    /DAU|MAU|활성\s*사용자.{0,20}\d+/g,
    /리뷰[가에서].{0,20}(평점|별점|점)/g,
  ];
  for (const pattern of USER_BEHAVIOR_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'user_behavior',
        groundingNeed: 0.75,
        suggestedSource: '앱스토어 리뷰/Reddit',
      });
    }
  }

  // Check for competitor claims (design doc Section 6.1: "경쟁사는...")
  const COMPETITOR_PATTERNS = [
    /경쟁사[는가].{0,30}/g,
    /경쟁\s*제품[은는이가].{0,30}/g,
    /시장\s*점유율.{0,20}\d+%/g,
    /대안[으로은는].{0,30}/g,
  ];
  for (const pattern of COMPETITOR_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      claims.push({
        text: match[0],
        type: 'competitor',
        groundingNeed: 0.7,
        suggestedSource: '웹 검색/크롤링',
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
