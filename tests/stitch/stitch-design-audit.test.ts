// Tests for stitch-design-audit — ADR-008 design dictatorship protocol compliance
import { describe, it, expect } from 'vitest';
import { auditDesignCompliance } from '../../src/stitch/stitch-design-audit.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STITCH_HTML = `
<html>
<head>
  <style>
    .card {
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(10px);
      background: linear-gradient(135deg, #667eea, #764ba2);
    }
    .title { color: #3b85f6; }
    .badge { border-radius: 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="card">
        <div class="inner">
          <h1 class="title">Hello</h1>
          <span class="badge">New</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ── Rule 1: No Approximation ──────────────────────────────────────────────────

describe('StitchDesignAudit — Rule 1: No Approximation', () => {
  it('should FAIL when rounded-md is used for 14px (non-standard value)', () => {
    const implCode = '<div className="rounded-md bg-white">card</div>';
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const radiusViolation = result.violations.find(
      v => v.rule === 'NO_APPROXIMATION' && v.message.includes('border-radius'),
    );
    expect(radiusViolation).toBeDefined();
    expect(radiusViolation!.stitchValue).toBe('14px');
  });

  it('should PASS when rounded-[14px] arbitrary value is used', () => {
    const implCode = '<div className="rounded-[14px] shadow-lg backdrop-blur-sm bg-gradient-to-r from-[#667eea]">card</div>';
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const radiusViolation = result.violations.find(
      v => v.rule === 'NO_APPROXIMATION' && v.message.includes('14px'),
    );
    expect(radiusViolation).toBeUndefined();
  });

  it('should PASS when rounded-lg is used for 8px (standard TW value)', () => {
    const stitchWith8px = '<style>.badge { border-radius: 8px; }</style>';
    const implCode = '<span className="rounded-lg">badge</span>';
    const result = auditDesignCompliance(stitchWith8px, implCode);
    // 8px = rounded-lg in TW v4, so this is exact — no violation
    const radiusViolation = result.violations.find(
      v => v.rule === 'NO_APPROXIMATION' && v.message.includes('8px'),
    );
    expect(radiusViolation).toBeUndefined();
  });

  it('should detect color approximation when close-but-wrong TW color is used', () => {
    // Stitch has #3b85f6 (not exactly #3b82f6 which is blue-500)
    const implCode = '<h1 className="text-blue-500">Title</h1>';
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const colorViolation = result.violations.find(
      v => v.rule === 'NO_APPROXIMATION' && v.message.includes('색상'),
    );
    expect(colorViolation).toBeDefined();
  });

  it('should PASS when exact TW color matches Stitch', () => {
    const stitch = '<div style="color: #3b82f6;"></div>';
    const implCode = '<div className="text-blue-500">ok</div>';
    const result = auditDesignCompliance(stitch, implCode);
    const colorViolation = result.violations.find(
      v => v.rule === 'NO_APPROXIMATION' && v.message.includes('색상'),
    );
    expect(colorViolation).toBeUndefined();
  });
});

// ── Rule 2: DOM Preservation ──────────────────────────────────────────────────

describe('StitchDesignAudit — Rule 2: DOM Preservation', () => {
  it('should FAIL when impl flattens 4-level nesting to 1-level', () => {
    const stitch = '<div><div><div><div>deep</div></div></div></div>';
    const implCode = '<div>flat</div>';
    const result = auditDesignCompliance(stitch, implCode);
    const domViolation = result.violations.find(v => v.rule === 'DOM_PRESERVATION');
    expect(domViolation).toBeDefined();
    expect(domViolation!.severity).toBe('error');
  });

  it('should WARN when depth difference is 2', () => {
    const stitch = '<div><div><div>deep</div></div></div>';
    const implCode = '<div>shallow</div>';
    const result = auditDesignCompliance(stitch, implCode);
    const domViolation = result.violations.find(v => v.rule === 'DOM_PRESERVATION');
    expect(domViolation).toBeDefined();
    expect(domViolation!.severity).toBe('warning');
  });

  it('should PASS when depth is preserved', () => {
    const stitch = '<div><div>ok</div></div>';
    const implCode = '<div><div>ok</div></div>';
    const result = auditDesignCompliance(stitch, implCode);
    const domViolation = result.violations.find(v => v.rule === 'DOM_PRESERVATION');
    expect(domViolation).toBeUndefined();
  });
});

// ── Rule 3: Effect Preservation ───────────────────────────────────────────────

describe('StitchDesignAudit — Rule 3: Effect Preservation', () => {
  it('should FAIL when backdrop-filter is missing from impl', () => {
    const implCode = '<div className="rounded-[14px] bg-white">card</div>';
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const effectViolation = result.violations.find(
      v => v.rule === 'EFFECT_PRESERVATION' && v.message.includes('backdrop-filter'),
    );
    expect(effectViolation).toBeDefined();
  });

  it('should FAIL when gradient is missing from impl', () => {
    const implCode = '<div className="rounded-[14px] backdrop-blur-sm bg-white">card</div>';
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const gradientViolation = result.violations.find(
      v => v.rule === 'EFFECT_PRESERVATION' && v.message.includes('linear-gradient'),
    );
    expect(gradientViolation).toBeDefined();
  });

  it('should PASS when all effects are preserved with Tailwind classes', () => {
    const implCode = `
      <div className="rounded-[14px] shadow-lg backdrop-blur-sm bg-gradient-to-r from-[#667eea] to-[#764ba2]">
        card
      </div>
    `;
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const effectViolation = result.violations.find(v => v.rule === 'EFFECT_PRESERVATION');
    expect(effectViolation).toBeUndefined();
  });

  it('should PASS when effects are preserved with raw CSS', () => {
    const implCode = `
      .card {
        border-radius: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        background: linear-gradient(135deg, #667eea, #764ba2);
      }
    `;
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    const effectViolation = result.violations.find(v => v.rule === 'EFFECT_PRESERVATION');
    expect(effectViolation).toBeUndefined();
  });
});

// ── Score & Verdict ───────────────────────────────────────────────────────────

describe('StitchDesignAudit — Score & Summary', () => {
  it('should return 100/PASS for empty inputs', () => {
    const result = auditDesignCompliance('', '');
    expect(result.verdict).toBe('PASS');
    expect(result.score).toBe(100);
  });

  it('should return PASS for fully compliant code', () => {
    const stitch = '<div style="border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,.1);"><div>ok</div></div>';
    const implCode = '<div className="rounded-lg shadow-sm"><div>ok</div></div>';
    const result = auditDesignCompliance(stitch, implCode);
    expect(result.verdict).toBe('PASS');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('should generate markdown summary', () => {
    const implCode = '<div className="rounded-md">card</div>';
    const result = auditDesignCompliance(STITCH_HTML, implCode);
    expect(result.summary).toContain('디자인 독재 프로토콜 감사 결과');
    expect(result.summary).toContain('/100점');
  });

  it('should deduct 15 points per error', () => {
    // Force multiple violations
    const stitch = `
      <style>
        .a { border-radius: 14px; backdrop-filter: blur(5px); background: linear-gradient(to right, red, blue); }
      </style>
      <div><div><div><div>deep</div></div></div></div>
    `;
    const implCode = '<div className="rounded-md">flat</div>';
    const result = auditDesignCompliance(stitch, implCode);
    const errorCount = result.violations.filter(v => v.severity === 'error').length;
    expect(errorCount).toBeGreaterThanOrEqual(2);
    expect(result.score).toBeLessThan(80);
  });
});
