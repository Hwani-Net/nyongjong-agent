// Grounding engine — orchestrates gap detection and fact verification
import { createLogger } from '../utils/logger.js';
import { detectGaps, type GapAnalysis, type FactualClaim } from './gap-detector.js';
import { ApiConnector, type ApiResult } from './api-connector.js';

const log = createLogger('grounding-engine');

export interface GroundingResult {
  /** Original gap analysis */
  analysis: GapAnalysis;
  /** Verification results per claim */
  verifications: ClaimVerification[];
  /** Overall grounding status */
  status: 'grounded' | 'partially_grounded' | 'ungrounded' | 'no_claims';
  /** Summary for the report */
  summary: string;
}

export interface ClaimVerification {
  claim: FactualClaim;
  /** API result for this claim */
  apiResult: ApiResult;
  /** Whether the claim was verified */
  verified: boolean;
}

export interface GroundingEngineOptions {
  /** API connector instance */
  apiConnector: ApiConnector;
  /** Minimum grounding need score to trigger verification (0-1) */
  minGroundingThreshold?: number;
  /** Max concurrent API calls */
  maxConcurrent?: number;
}

export class GroundingEngine {
  private apiConnector: ApiConnector;
  private minThreshold: number;

  constructor(options: GroundingEngineOptions) {
    this.apiConnector = options.apiConnector;
    this.minThreshold = options.minGroundingThreshold || 0.7;
    log.info('GroundingEngine initialized', { threshold: this.minThreshold });
  }

  /**
   * Analyze text and verify factual claims above threshold.
   */
  async ground(text: string): Promise<GroundingResult> {
    log.info('Starting grounding process', { textLength: text.length });

    // Step 1: Detect gaps
    const analysis = detectGaps(text);

    if (analysis.claims.length === 0) {
      return {
        analysis,
        verifications: [],
        status: 'no_claims',
        summary: 'No factual claims detected.',
      };
    }

    // Step 2: Filter claims above threshold
    const toVerify = analysis.claims.filter((c) => c.groundingNeed >= this.minThreshold);
    log.info(`${toVerify.length}/${analysis.claims.length} claims above threshold`);

    // Step 3: Verify each claim (sequentially to respect API rate limits)
    const verifications: ClaimVerification[] = [];

    for (const claim of toVerify) {
      const apiResult = await this.apiConnector.groundClaim(claim.text, claim.suggestedSource);
      verifications.push({
        claim,
        apiResult,
        verified: apiResult.success && apiResult.data.length > 0,
      });
    }

    // Step 4: Determine overall status
    const verifiedCount = verifications.filter((v) => v.verified).length;
    const status = verifiedCount === 0 ? 'ungrounded'
      : verifiedCount === toVerify.length ? 'grounded'
      : 'partially_grounded';

    const summary = `Grounding: ${verifiedCount}/${toVerify.length} claims verified (${status}). ` +
      `Total claims detected: ${analysis.claims.length}.`;

    log.info(summary);

    return { analysis, verifications, status, summary };
  }

  /**
   * Quick check — only detect gaps without calling APIs.
   */
  quickCheck(text: string): GapAnalysis {
    return detectGaps(text);
  }
}
