'use strict';

const cds = require('@sap/cds');
const ai  = require('./lib/aicore-client');

class AiService extends cds.ApplicationService {
  async init() {
    const LOG = cds.log('ai-service');
    if (!ai.hasCredentials()) LOG.warn('AI_CORE_* env vars not set — mock mode.');

    // ── getDeployments ───────────────────────────────────────────────────────
    this.on('getDeployments', async () => {
      if (!ai.hasCredentials()) return mockDeployments();
      const groups = await ai.listResourceGroups();
      const all = [];
      for (const g of groups) {
        try {
          const deps = await ai.listDeployments(g.resourceGroupId || g.id);
          for (const d of deps) {
            all.push({
              id:              d.id,
              scenarioId:      d.scenarioId || d.scenario || '',
              modelName:       d.details?.resources?.backend_details?.model?.name || d.modelName || '',
              modelProvider:   d.details?.resources?.backend_details?.model?.provider
                            || inferProvider(d.details?.resources?.backend_details?.model?.name || ''),
              resourceGroup:   g.resourceGroupId || g.id || '',
              status:          d.status || '',
              createdAt:       d.createdAt || '',
              deployedBy:      d.createdBy || d.modifiedBy || '',
              targetUrl:       d.deploymentUrl || '',
            });
          }
        } catch (e) {
          LOG.warn(`Skip RG ${g.id}: ${e.message}`);
        }
      }
      return all;
    });

    // ── getOrchestrationConfigs ─────────────────────────────────────────────
    this.on('getOrchestrationConfigs', async () => {
      if (!ai.hasCredentials()) return mockConfigs();
      const groups = await ai.listResourceGroups();
      const policies = await cds.db.run(
        SELECT.from('com.btpconsulting.aigovernance.ContentFilterPolicy')
      );
      const all = [];
      for (const g of groups) {
        try {
          const configs = await ai.listConfigurations(g.resourceGroupId || g.id);
          for (const c of configs) {
            const params = c.parameterBindings || c.parameters || {};
            const modules = params.module_configurations || params.modules || {};
            const filtering = modules.filtering_module_config || modules.filtering || {};
            const masking   = modules.masking_module_config   || modules.masking   || {};
            const grounding = modules.grounding_module_config || modules.grounding || {};
            const hasInput  = !!(filtering.input  || filtering.input_filtering);
            const hasOutput = !!(filtering.output || filtering.output_filtering);
            const hasMask   = !!(masking.enabled  || (masking.entities && masking.entities.length));
            const violations = [];
            const policy = policies.find((p) => p.scenarioPattern && new RegExp(p.scenarioPattern, 'i').test(c.scenarioId || ''));
            if (policy?.requireInputFilter && !hasInput)   violations.push('input filter missing');
            if (policy?.requireOutputFilter && !hasOutput) violations.push('output filter missing');
            if (policy?.requireMasking && !hasMask)        violations.push('data masking missing');
            all.push({
              configId:        c.id,
              scenarioId:      c.scenarioId || '',
              templateName:    c.name || '',
              modelName:       modules.llm_module_config?.model?.name || '',
              hasInputFilter:  hasInput,
              hasOutputFilter: hasOutput,
              hasMasking:      hasMask,
              grounding:       grounding.enabled ? (grounding.type || 'vector-db') : 'disabled',
              deployedTo:      [],
              compliant:       violations.length === 0,
              violations,
            });
          }
        } catch (e) {
          LOG.warn(`Configs skip RG ${g.id}: ${e.message}`);
        }
      }
      return all;
    });

    // ── getSpend ─────────────────────────────────────────────────────────────
    //
    // AI Core spend data is exposed via UAS under service "ai-core" — that
    // data is not differentiated by model. The accurate way to attribute spend
    // per model is from AI Core's metrics API, not implemented here in v1.
    // For demo purposes we approximate with mock + UAS aggregate when bound.
    this.on('getSpend', async (req) => mockSpend(req.data?.months || 6));

    // ── getAlerts ────────────────────────────────────────────────────────────
    this.on('getAlerts', async (req) => {
      const days = Math.min(Math.max(req.data?.days || 7, 1), 30);
      const cutoff = new Date(Date.now() - days * 86_400_000);
      try {
        return await cds.db.run(
          SELECT.from('com.btpconsulting.aigovernance.PromptInjectionAlert')
            .where({ timestamp: { '>=': cutoff } })
            .orderBy('timestamp desc')
        );
      } catch (e) {
        cds.log('ai-service').warn(`Alerts query: ${e.message}`);
        return mockAlerts(days);
      }
    });

    // ── getSummary ───────────────────────────────────────────────────────────
    this.on('getSummary', async () => {
      const [deps, configs, spend, alerts] = await Promise.all([
        this.send('getDeployments'),
        this.send('getOrchestrationConfigs'),
        this.send('getSpend', { months: 1 }),
        this.send('getAlerts', { days: 7 }),
      ]);
      return {
        activeDeployments:       deps.filter((d) => /running|complete/i.test(d.status)).length,
        modelsInUse:             new Set(deps.map((d) => d.modelName).filter(Boolean)).size,
        monthlySpendEur:         Math.round(spend.reduce((s, r) => s + Number(r.costEur || 0), 0) * 100) / 100,
        configsWithoutFilter:    configs.filter((c) => !c.hasInputFilter || !c.hasOutputFilter).length,
        configsWithoutMasking:   configs.filter((c) => !c.hasMasking).length,
        promptInjectionAlerts7d: alerts.length,
      };
    });

    return super.init();
  }
}

function inferProvider(modelName) {
  const m = (modelName || '').toLowerCase();
  if (m.includes('gpt'))       return 'Azure OpenAI';
  if (m.includes('claude'))    return 'Anthropic / AWS';
  if (m.includes('gemini'))    return 'Google';
  if (m.includes('mistral'))   return 'Mistral';
  if (m.includes('llama'))     return 'Meta';
  if (m.includes('nova'))      return 'Amazon';
  return 'Unknown';
}

module.exports = AiService;
module.exports.__test__ = { inferProvider };

// ─── Mocks ────────────────────────────────────────────────────────────────────
function mockDeployments() {
  return [
    { id: 'dep-001', scenarioId: 'orchestration',  modelName: 'gpt-4o',            modelProvider: 'Azure OpenAI', resourceGroup: 'finance',  status: 'RUNNING',  createdAt: '2026-03-04T10:12:00Z', deployedBy: 'alice@acme.com',  targetUrl: 'https://api.ai.prod.../deployments/dep-001' },
    { id: 'dep-002', scenarioId: 'orchestration',  modelName: 'claude-3-7-sonnet', modelProvider: 'Anthropic / AWS', resourceGroup: 'finance', status: 'RUNNING', createdAt: '2026-04-22T14:30:00Z', deployedBy: 'alice@acme.com',  targetUrl: 'https://api.ai.prod.../deployments/dep-002' },
    { id: 'dep-003', scenarioId: 'document-grounding', modelName: 'text-embedding-3-large', modelProvider: 'Azure OpenAI', resourceGroup: 'rag-knowledge', status: 'RUNNING', createdAt: '2026-02-15T09:00:00Z', deployedBy: 'bob@acme.com', targetUrl: 'https://api.ai.prod.../deployments/dep-003' },
    { id: 'dep-004', scenarioId: 'orchestration',  modelName: 'gemini-1.5-pro',     modelProvider: 'Google',       resourceGroup: 'sandbox', status: 'RUNNING',  createdAt: '2026-05-01T11:45:00Z', deployedBy: 'carol@acme.com', targetUrl: 'https://api.ai.prod.../deployments/dep-004' },
    { id: 'dep-005', scenarioId: 'orchestration',  modelName: 'mistral-large-2',    modelProvider: 'Mistral',      resourceGroup: 'experiments', status: 'STOPPED', createdAt: '2026-01-12T08:20:00Z', deployedBy: 'dave@acme.com', targetUrl: 'https://api.ai.prod.../deployments/dep-005' },
    { id: 'dep-006', scenarioId: 'orchestration',  modelName: 'claude-3-7-sonnet', modelProvider: 'Anthropic / AWS', resourceGroup: 'support-bot', status: 'RUNNING', createdAt: '2026-05-03T16:00:00Z', deployedBy: 'erin@acme.com', targetUrl: 'https://api.ai.prod.../deployments/dep-006' },
  ];
}

function mockConfigs() {
  return [
    { configId: 'cfg-001', scenarioId: 'orchestration', templateName: 'finance-doc-summarizer',  modelName: 'gpt-4o',                  hasInputFilter: true,  hasOutputFilter: true,  hasMasking: true,  grounding: 'disabled', deployedTo: ['dep-001'], compliant: true,  violations: [] },
    { configId: 'cfg-002', scenarioId: 'orchestration', templateName: 'customer-email-drafts',   modelName: 'claude-3-7-sonnet',       hasInputFilter: true,  hasOutputFilter: false, hasMasking: false, grounding: 'disabled', deployedTo: ['dep-002'], compliant: false, violations: ['output filter missing', 'data masking missing'] },
    { configId: 'cfg-003', scenarioId: 'document-grounding', templateName: 'kb-embedding-pipeline', modelName: 'text-embedding-3-large', hasInputFilter: false, hasOutputFilter: false, hasMasking: false, grounding: 'vector-db', deployedTo: ['dep-003'], compliant: true, violations: [] },
    { configId: 'cfg-004', scenarioId: 'orchestration', templateName: 'sandbox-experiment',      modelName: 'gemini-1.5-pro',           hasInputFilter: false, hasOutputFilter: false, hasMasking: false, grounding: 'disabled', deployedTo: ['dep-004'], compliant: false, violations: ['input filter missing', 'output filter missing', 'data masking missing'] },
    { configId: 'cfg-005', scenarioId: 'orchestration', templateName: 'support-l1-bot',          modelName: 'claude-3-7-sonnet',       hasInputFilter: true,  hasOutputFilter: true,  hasMasking: true,  grounding: 'document-store', deployedTo: ['dep-006'], compliant: true, violations: [] },
  ];
}

function mockSpend(months) {
  const out = [];
  const d = new Date(); d.setDate(1);
  for (let i = months - 1; i >= 0; i--) {
    const ref = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const ym = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    const base = 1800 + i * 240;
    out.push({ yearMonth: ym, modelProvider: 'Azure OpenAI',   modelName: 'gpt-4o',            costEur: base + 200,    tokensIn: 4_200_000 + i * 400_000, tokensOut: 1_800_000 + i * 150_000 });
    out.push({ yearMonth: ym, modelProvider: 'Anthropic / AWS', modelName: 'claude-3-7-sonnet', costEur: base + 800,    tokensIn: 3_100_000 + i * 600_000, tokensOut: 1_400_000 + i * 250_000 });
    out.push({ yearMonth: ym, modelProvider: 'Azure OpenAI',   modelName: 'text-embedding-3-large', costEur: base / 6, tokensIn: 18_000_000, tokensOut: 0 });
    out.push({ yearMonth: ym, modelProvider: 'Google',         modelName: 'gemini-1.5-pro',    costEur: base / 5,     tokensIn: 900_000, tokensOut: 350_000 });
  }
  return out;
}

function mockAlerts(_days) {
  return [
    { timestamp: new Date(Date.now() -  2 * 3600_000).toISOString(), deploymentId: 'dep-002', scenario: 'orchestration', severity: 'error', reason: 'Prompt injection detected — "ignore previous instructions"' },
    { timestamp: new Date(Date.now() - 18 * 3600_000).toISOString(), deploymentId: 'dep-004', scenario: 'orchestration', severity: 'warn',  reason: 'Output blocked by content filter — category: hate' },
    { timestamp: new Date(Date.now() - 72 * 3600_000).toISOString(), deploymentId: 'dep-001', scenario: 'orchestration', severity: 'info',  reason: 'PII detected in input; masking applied' },
  ];
}
