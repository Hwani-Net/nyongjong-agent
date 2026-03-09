import { describe, it, expect } from 'vitest';
import { detectDomainPersonas, getTemplate, getAvailableDomains } from '../../src/personas/persona-templates.js';

describe('PersonaTemplates', () => {
  describe('detectDomainPersonas', () => {
    it('should detect fintech domain from payment keywords', () => {
      const personas = detectDomainPersonas('카카오페이 결제 연동 구현');
      expect(personas.length).toBeGreaterThanOrEqual(1);
      expect(personas.some(p => p.id === 'fintech-advisor')).toBe(true);
    });

    it('should detect AI/ML domain from machine learning keywords', () => {
      const personas = detectDomainPersonas('GPT 기반 RAG 시스템을 구축해야 합니다');
      expect(personas.length).toBeGreaterThanOrEqual(1);
      expect(personas.some(p => p.id === 'data-scientist')).toBe(true);
    });

    it('should detect ecommerce domain from shopping keywords', () => {
      const personas = detectDomainPersonas('쇼핑몰 장바구니 기능 구현');
      expect(personas.length).toBeGreaterThanOrEqual(1);
      expect(personas.some(p => p.id === 'ecommerce-lead')).toBe(true);
    });

    it('should detect healthcare domain from medical keywords', () => {
      const personas = detectDomainPersonas('환자 진단 기록 관리 시스템');
      expect(personas.length).toBeGreaterThanOrEqual(1);
      expect(personas.some(p => p.id === 'health-compliance')).toBe(true);
    });

    it('should detect devops domain from infrastructure keywords', () => {
      const personas = detectDomainPersonas('Docker 기반 CI/CD 파이프라인 구축');
      expect(personas.length).toBeGreaterThanOrEqual(1);
      expect(personas.some(p => p.id === 'devops-engineer')).toBe(true);
    });

    it('should detect design domain from UX keywords', () => {
      const personas = detectDomainPersonas('피그마 기반 UI 디자인 시스템 구축');
      expect(personas.length).toBeGreaterThanOrEqual(1);
      expect(personas.some(p => p.id === 'ux-designer')).toBe(true);
    });

    it('should detect multiple domains from mixed keywords', () => {
      const personas = detectDomainPersonas('AI 기반 결제 시스템 디자인');
      expect(personas.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for generic goal', () => {
      const personas = detectDomainPersonas('간단한 코드 수정');
      expect(personas.length).toBe(0);
    });

    it('should detect blockchain domain', () => {
      const personas = detectDomainPersonas('이더리움 스마트 컨트랙트 개발');
      expect(personas.some(p => p.id === 'web3-advisor')).toBe(true);
    });

    // ─── New Business Domain Tests ───

    it('should detect franchise domain from Korean keywords', () => {
      const personas = detectDomainPersonas('프랜차이즈 가맹점 모집 플랫폼 개발');
      expect(personas.length).toBeGreaterThanOrEqual(2);
      expect(personas.some(p => p.id === 'franchise-regulator')).toBe(true);
      expect(personas.some(p => p.id === 'franchise-angry-owner')).toBe(true);
    });

    it('should detect franchise domain from business keywords', () => {
      const personas = detectDomainPersonas('창업 상권분석 서비스');
      expect(personas.some(p => p.id === 'franchise-prospector')).toBe(true);
    });

    it('should detect realestate domain from property keywords', () => {
      const personas = detectDomainPersonas('부동산 매물 중개 플랫폼');
      expect(personas.length).toBeGreaterThanOrEqual(2);
      expect(personas.some(p => p.id === 'realestate-broker')).toBe(true);
      expect(personas.some(p => p.id === 'realestate-first-buyer')).toBe(true);
    });

    it('should detect realestate domain from PropTech keywords', () => {
      const personas = detectDomainPersonas('PropTech STO 토큰 증권 투자 플랫폼');
      expect(personas.some(p => p.id === 'realestate-sto-investor')).toBe(true);
    });

    it('should detect saas domain from subscription keywords', () => {
      const personas = detectDomainPersonas('B2B SaaS 구독 관리 시스템 개발');
      expect(personas.length).toBeGreaterThanOrEqual(2);
      expect(personas.some(p => p.id === 'saas-cfo')).toBe(true);
      expect(personas.some(p => p.id === 'saas-churn-customer')).toBe(true);
    });

    it('should detect saas domain from churn keywords', () => {
      const personas = detectDomainPersonas('이탈률 분석 및 온보딩 개선');
      expect(personas.some(p => p.id === 'saas-enterprise-buyer')).toBe(true);
    });

    it('should detect legal domain from law keywords', () => {
      const personas = detectDomainPersonas('법률 상담 챗봇 — 소송 계약서 검토');
      expect(personas.length).toBeGreaterThanOrEqual(2);
      expect(personas.some(p => p.id === 'legal-advisor')).toBe(true);
      expect(personas.some(p => p.id === 'legal-debtor')).toBe(true);
    });

    it('should detect legal domain from debt keywords', () => {
      const personas = detectDomainPersonas('채권 추심 사해행위 취소 소송 도우미');
      expect(personas.some(p => p.id === 'legal-contract-nitpicker')).toBe(true);
    });

    it('should detect franchise + legal cross-domain', () => {
      const personas = detectDomainPersonas('프랜차이즈 가맹사업법 계약서 법적 검토 시스템');
      const domains = new Set(personas.map(p => p.id.split('-')[0]));
      expect(domains.has('franchise')).toBe(true);
      expect(domains.has('legal')).toBe(true);
    });
  });

  describe('getTemplate', () => {
    it('should return template by domain key', () => {
      const template = getTemplate('fintech');
      expect(template).toBeDefined();
      expect(template!.id).toBe('fintech-advisor');
      expect(template!.category).toBe('regulatory');
    });

    it('should return undefined for unknown domain', () => {
      expect(getTemplate('nonexistent')).toBeUndefined();
    });

    it('should return franchise template', () => {
      const template = getTemplate('franchise');
      expect(template).toBeDefined();
      expect(template!.id).toBe('franchise-regulator');
      expect(template!.category).toBe('regulatory');
    });

    it('should return realestate template', () => {
      const template = getTemplate('realestate');
      expect(template).toBeDefined();
      expect(template!.id).toBe('realestate-broker');
    });

    it('should return saas template', () => {
      const template = getTemplate('saas');
      expect(template).toBeDefined();
      expect(template!.id).toBe('saas-cfo');
    });

    it('should return legal template', () => {
      const template = getTemplate('legal');
      expect(template).toBeDefined();
      expect(template!.id).toBe('legal-advisor');
      expect(template!.category).toBe('regulatory');
    });
  });

  describe('getAvailableDomains', () => {
    it('should return all domain keys including new business domains', () => {
      const domains = getAvailableDomains();
      // Original 8 domains
      expect(domains).toContain('fintech');
      expect(domains).toContain('ai_ml');
      expect(domains).toContain('ecommerce');
      expect(domains).toContain('healthcare');
      expect(domains).toContain('devops');
      expect(domains).toContain('design');
      expect(domains).toContain('blockchain');
      expect(domains).toContain('education');
      // New 4 business domains
      expect(domains).toContain('franchise');
      expect(domains).toContain('realestate');
      expect(domains).toContain('saas');
      expect(domains).toContain('legal');
      expect(domains.length).toBe(12);
    });
  });
});
