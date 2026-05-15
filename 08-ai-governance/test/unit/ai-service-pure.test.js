'use strict';

const { expect } = require('chai');
const { __test__ } = require('../../srv/ai-service');

const { inferProvider } = __test__;

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
});
