# BTP AI Services Governance Console

App **#8**. What people are actually doing with GenAI on BTP — deployments, configs, content-filter coverage, prompt-injection alerts.

## Sources
- AI Core admin API (resource groups, deployments, configurations)
- Operator-seeded `ContentFilterPolicy` for compliance rules
- `PromptInjectionAlert` table (populated by AI Core → app webhook in production)

## Per-client deploy
```powershell
cf set-env ai-srv AI_CORE_URL          'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com'
cf set-env ai-srv AI_CORE_OAUTH_URL    'https://<subdomain>.authentication.eu10.hana.ondemand.com/oauth/token'
cf set-env ai-srv AI_CORE_CLIENT_ID    '<client-id>'
cf set-env ai-srv AI_CORE_CLIENT_SECRET '<client-secret>'
cf restage ai-srv
```

## Engagement deployment time
**~1 hour** for read-only governance dashboard. Real-time alert ingestion (webhooks from AI Core scenarios) adds ~2 hours when scoped.
