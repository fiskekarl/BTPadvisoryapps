'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/ai-service');

const {
  inferProvider, rateFor, estimateCost, monthsAgoIso,
  extractTokens, aggregateMetricsToSpend, MODEL_RATE_CARD, UNKNOWN_MODEL_RATE,
} = __test__;

describe('ai-service pure helpers', () => {

  describe('inferProvider', () => {
    it('detects Azure OpenAI from GPT model name', () => {
      expect(inferProvider('gpt-4o')).to.equal('Azure OpenAI');
      expect(inferProvider('gpt-3.5-turbo')).to.equal('Azure OpenAI');
    });

    it('detects Anthropic from Claude model name', () => {
      expect(inferProvider('claude-3-7-sonnet')).to.equal('Anthropic / AWS');
    });

    it('detects Google from Gemini model name', () => {
      expect(inferProvider('gemini-1.5-pro')).to.equal('Google');
    });

    it('detects Mistral', () => {
      expect(inferProvider('mistral-large-2')).to.equal('Mistral');
    });

    it('detects Meta from Llama', () => {
      expect(inferProvider('llama-3-70b')).to.equal('Meta');
    });

    it('detects Amazon from Nova', () => {
      expect(inferProvider('nova-pro')).to.equal('Amazon');
    });

    it('returns Unknown for unrecognized model names', () => {
      expect(inferProvider('custom-model')).to.equal('Unknown');
      expect(inferProvider('')).to.equal('Unknown');
      expect(inferProvider(null)).to.equal('Unknown');
    });
  });

  describe('rateFor', () => {
    it('returns the rate-card entry for a known model', () => {
      expect(rateFor('gpt-4o')).to.equal(MODEL_RATE_CARD['gpt-4o']);
    });

    it('falls back to UNKNOWN_MODEL_RATE for unknown models', () => {
      expect(rateFor('mystery-model-9000')).to.equal(UNKNOWN_MODEL_RATE);
      expect(rateFor('')).to.equal(UNKNOWN_MODEL_RATE);
    });
  });

  describe('estimateCost', () => {
    it('multiplies tokens by per-million rate, rounds to cents', () => {
      // gpt-4o: 4.55 in, 13.65 out
      // 1M in + 1M out = 4.55 + 13.65 = 18.20
      expect(estimateCost('gpt-4o', 1_000_000, 1_000_000)).to.equal(18.20);
    });

    it('returns 0 for zero tokens', () => {
      expect(estimateCost('gpt-4o', 0, 0)).to.equal(0);
    });

    it('handles output-only models like embeddings (outEur=0)', () => {
      // text-embedding-3-large: 0.12 in, 0 out
      expect(estimateCost('text-embedding-3-large', 10_000_000, 5_000_000)).to.equal(1.20);
    });

    it('uses unknown-model fallback for novel models', () => {
      // unknown rate: 1.00 in, 3.00 out → 1M in + 1M out = 4.00
      expect(estimateCost('mystery', 1_000_000, 1_000_000)).to.equal(4.00);
    });
  });

  describe('monthsAgoIso', () => {
    it('returns first-of-month, N months back, in ISO 8601', () => {
      const iso = monthsAgoIso(3);
      expect(iso).to.match(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
      const back = new Date(iso);
      const now  = new Date();
      // Should be roughly 3 months earlier (allow ± 1 month for boundary)
      const diffMonths = (now.getFullYear() - back.getFullYear()) * 12 + (now.getMonth() - back.getMonth());
      expect(diffMonths).to.be.within(2, 4);
    });
  });

  describe('extractTokens', () => {
    it('returns null when no token signal anywhere', () => {
      expect(extractTokens({})).to.equal(null);
    });

    it('reads top-level tokensIn/tokensOut/modelName/timestamp', () => {
      const r = extractTokens({
        tokensIn: 100, tokensOut: 50, modelName: 'gpt-4o', timestamp: '2026-05-01T12:00:00Z',
      });
      expect(r).to.deep.equal({ in: 100, out: 50, model: 'gpt-4o', ts: '2026-05-01T12:00:00Z' });
    });

    it('aggregates from metricResources[] with name + value + labels', () => {
      const r = extractTokens({
        startTime: '2026-04-15T08:00:00Z',
        metricResources: [
          { name: 'Input Tokens',  value: 1000, labels: [{ name: 'Model', value: 'claude-3-7-sonnet' }] },
          { name: 'Output Tokens', value: 200 },
          { name: 'Latency',       value: 350 }, // not a token metric — ignored
        ],
      });
      expect(r.in).to.equal(1000);
      expect(r.out).to.equal(200);
      expect(r.model).to.equal('claude-3-7-sonnet');
      expect(r.ts).to.equal('2026-04-15T08:00:00Z');
    });

    it('treats "Total Tokens" / "tokens" as input (no breakdown available)', () => {
      const r = extractTokens({
        timestamp: '2026-03-01T00:00:00Z',
        modelName: 'gpt-4o',
        metricResources: [{ name: 'Total Tokens', value: 500 }],
      });
      expect(r.in).to.equal(500);
      expect(r.out).to.equal(0);
    });

    it('reads model from row-level metricLabels when not on metricResources', () => {
      const r = extractTokens({
        startTime: '2026-02-10T00:00:00Z',
        metricLabels: [{ name: 'Model', value: 'gemini-1.5-pro' }],
        metricResources: [{ name: 'Input Tokens', value: 100 }],
      });
      expect(r.model).to.equal('gemini-1.5-pro');
    });
  });

  describe('aggregateMetricsToSpend', () => {
    it('groups by (yearMonth, model) and sums token counts', () => {
      const rows = [
        { startTime: '2026-04-05T00:00:00Z', modelName: 'gpt-4o', tokensIn: 500_000, tokensOut: 200_000 },
        { startTime: '2026-04-22T00:00:00Z', modelName: 'gpt-4o', tokensIn: 500_000, tokensOut: 300_000 },
        { startTime: '2026-04-12T00:00:00Z', modelName: 'claude-3-7-sonnet', tokensIn: 200_000, tokensOut: 100_000 },
        { startTime: '2026-05-03T00:00:00Z', modelName: 'gpt-4o', tokensIn: 100_000, tokensOut: 50_000 },
      ];
      const out = aggregateMetricsToSpend(rows);
      expect(out).to.have.length(3);

      const aprGpt = out.find((r) => r.yearMonth === '2026-04' && r.modelName === 'gpt-4o');
      expect(aprGpt.tokensIn).to.equal(1_000_000);
      expect(aprGpt.tokensOut).to.equal(500_000);
      // 1M × 4.55 + 0.5M × 13.65 = 4.55 + 6.825 = 11.375 → 11.38
      expect(aprGpt.costEur).to.equal(11.38);
      expect(aprGpt.modelProvider).to.equal('Azure OpenAI');

      const aprClaude = out.find((r) => r.yearMonth === '2026-04' && r.modelName === 'claude-3-7-sonnet');
      expect(aprClaude.modelProvider).to.equal('Anthropic / AWS');
    });

    it('skips rows without tokens, ts, or model', () => {
      const rows = [
        { startTime: '2026-05-01T00:00:00Z' /* no model, no tokens */ },
        { modelName: 'gpt-4o', tokensIn: 100 /* no ts */ },
        { startTime: '2026-05-01T00:00:00Z', tokensIn: 100 /* no model */ },
      ];
      expect(aggregateMetricsToSpend(rows)).to.deep.equal([]);
    });

    it('returns rows sorted by yearMonth then modelName', () => {
      const rows = [
        { startTime: '2026-05-01T00:00:00Z', modelName: 'gpt-4o', tokensIn: 100, tokensOut: 100 },
        { startTime: '2026-04-01T00:00:00Z', modelName: 'gpt-4o', tokensIn: 100, tokensOut: 100 },
        { startTime: '2026-04-01T00:00:00Z', modelName: 'claude-3-7-sonnet', tokensIn: 100, tokensOut: 100 },
      ];
      const out = aggregateMetricsToSpend(rows);
      expect(out.map((r) => `${r.yearMonth}/${r.modelName}`)).to.deep.equal([
        '2026-04/claude-3-7-sonnet',
        '2026-04/gpt-4o',
        '2026-05/gpt-4o',
      ]);
    });
  });
});
