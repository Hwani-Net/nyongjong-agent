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
  });

  describe('getAvailableDomains', () => {
    it('should return all domain keys', () => {
      const domains = getAvailableDomains();
      expect(domains).toContain('fintech');
      expect(domains).toContain('ai_ml');
      expect(domains).toContain('ecommerce');
      expect(domains).toContain('healthcare');
      expect(domains).toContain('devops');
      expect(domains).toContain('design');
      expect(domains).toContain('blockchain');
      expect(domains).toContain('education');
      expect(domains.length).toBe(8);
    });
  });
});
