# Recgon Monetization Plan

## Summary

Recgon can be profitable as a vertical AI SaaS, but only if pricing is tied to the expensive workflows already visible in the codebase:

- `project analysis` is the flagship and highest-value action.
- `mentor chat` is the most likely hidden margin killer because prompt size grows with history, project summaries, and tool schemas.
- `competitor analysis` and `website scraping` are premium features because they add both LLM and Firecrawl cost.
- `marketing`, `feedback`, and `analytics insights` are cheap enough to bundle generously.

The right shape is:

1. Keep a small free tier for acquisition.
2. Charge monthly for workflow access, not unlimited usage.
3. Add credit-based overages for deep analysis instead of flat unlimited plans.
4. Reserve team features, competitor scans, and higher quotas for higher tiers.

## What The Codebase Is Selling Today

From the current implementation, Recgon already behaves like an AI operator for solo founders:

- Repo or idea analysis
- Re-analysis from GitHub diffs
- Marketing content generation
- Campaign planning
- Feedback analysis
- GA4 insight generation
- Context-aware mentor chat
- PDF export
- Team collaboration

That is enough to sell as "product strategy + growth copilot for founders".

## Current Cost Drivers

### Variable cost

The main variable cost is model usage:

- Gemini is the primary provider: `gemini-2.5-flash`, then `gemini-2.5-flash-lite`
- Claude Haiku 4.5 is the fallback provider
- Firecrawl is used for website scraping

### Fixed or semi-fixed cost

- Vercel hosting
- Supabase project + compute
- Resend for email
- Firecrawl paid plan if scraping volume grows

## Current Pricing References

These are the vendor prices I used for the model below. They should be rechecked before launch.

- Gemini 2.5 Flash: $0.30 / 1M input tokens, $2.50 / 1M output tokens  
  Source: [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Gemini 2.5 Flash-Lite: $0.10 / 1M input tokens, $0.40 / 1M output tokens  
  Source: [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Claude Haiku 4.5: $1 / 1M input tokens, $5 / 1M output tokens  
  Source: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Vercel Pro: $20/mo + usage  
  Source: [Vercel pricing](https://vercel.com/pricing)
- Supabase Pro: Pro plan plus compute model; FAQ example shows `$25` Pro with `$10` compute credits covering one default compute project  
  Source: [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
- Resend Pro: $20/mo for 50,000 emails  
  Source: [Resend pricing](https://resend.com/pricing)
- Firecrawl Hobby: $16/mo for 3,000 credits; Standard: $83/mo for 100,000 credits  
  Source: [Firecrawl pricing](https://www.firecrawl.dev/pricing)

## Estimated Unit Economics

These are working assumptions based on the current prompts, token ceilings, and route behavior. They are estimates, not measured telemetry.

### Assumptions

- Standard codebase analysis: 80k input tokens, 5k output tokens on Gemini Flash
- Re-analysis from Git diff: 25k input, 4k output
- Marketing generation: 15k input, 2k output
- Campaign plan: 25k input, 5k output
- Feedback analysis: 20k input, 3k output
- Analytics insight pass: 15k input, 2k output
- Mentor chat turn: 25k input, 1.2k output average
- Claude fallback happens rarely; if it becomes common, margins drop fast

### Estimated direct cost per action

- Full repo analysis: about `$0.04`
- GitHub diff re-analysis: about `$0.02`
- Marketing generation: about `$0.01`
- Campaign plan: about `$0.02`
- Feedback analysis: about `$0.01`
- Analytics insight generation: about `$0.01`
- Mentor chat turn: about `$0.01`

### Premium workflow cost

Competitor analysis is the premium action because it can include:

- main analysis
- extra competitor scrape calls
- extra LLM pass over scraped content

A realistic all-in competitor/deep-analysis workflow can land around `$0.10` to `$0.40` depending on scrape count and fallback behavior. That should not sit inside an unlimited free or low-end plan.

## Fixed Monthly Cost Floor

For a real paid launch, a practical baseline looks like:

- Vercel Pro: `$20/mo`
- Supabase Pro: roughly `$25/mo` for the org plan, with default compute effectively covered for one main project per Supabase's billing example
- Resend: `$0` to `$20/mo`
- Firecrawl: `$0` to `$16/mo` at low volume

Practical starting floor: about `$45` to `$81/mo` before overages.

That means profitability does not require many customers. It requires correct packaging.

## Recommended Packaging

### Free

Purpose: acquisition only.

- 1 project
- 1 analysis total
- 20 mentor messages/month
- 5 marketing generations/month
- 2 feedback analyses/month
- no competitor analysis
- no team features
- no PDF export branding removal

Target: let users reach the first "this understands my product" moment, then stop.

### Starter — `$19/mo`

For solo founders validating one product.

- 3 analyses/month
- 150 mentor messages/month
- 30 marketing generations/month
- 10 feedback analyses/month
- 5 analytics insight runs/month
- 1 seat
- PDF export

Expected gross margin stays strong unless the user is chat-heavy all day.

### Growth — `$49/mo`

For active indie hackers shipping and iterating weekly.

- 10 analyses/month
- 500 mentor messages/month
- 100 marketing generations/month
- 30 feedback analyses/month
- 20 analytics insight runs/month
- competitor analysis included
- priority queue
- 1 seat

This should be the default plan.

### Team — `$149/mo`

For small startup teams.

- 30 analyses/month shared
- 1,500 mentor messages/month shared
- 300 marketing generations/month
- 100 feedback analyses/month
- 50 analytics insight runs/month
- 3 seats included
- shared projects
- invite flows
- team roles
- competitor analysis

Additional seats: `$24/mo` each.

### Overage credits

Do not sell unlimited. Sell extra high-cost work cleanly.

- Extra deep analysis: `$4` each
- 5-pack of analyses: `$15`
- Extra 250 mentor messages: `$8`
- Extra competitor scan bundle: `$9`

This protects margins while keeping expansion friction low.

## Why This Works

### Value-based fit

Recgon is not a generic chatbot. It is selling:

- clarity on what the product is
- what to build next
- how to position it
- how to market it

That value is much closer to founder tooling than commodity text generation. `$19` to `$49` is reasonable if the first analysis is strong.

### Margin protection

The cheap workflows can be bundled aggressively:

- marketing
- feedback
- analytics summaries

The expensive workflows should be gated:

- full analyses
- competitor/deep scans
- large chat allowances

## Product Changes Needed Before Charging

### 1. Replace the current quota model

Right now `src/lib/analysisQuota.ts` enforces:

- 3 analyses lifetime
- 14-day cooldown

That is usable as an academic/demo restriction, but not as paid SaaS packaging. Replace it with plan-based monthly quotas plus purchasable overages.

### 2. Stop advertising the product as fully free

The landing page still declares free pricing in structured data and FAQ copy:

- [src/app/landing/page.tsx](/Users/eneskis/Documents/Projects/Recgon/src/app/landing/page.tsx)

That will suppress conversion and make future pricing changes feel like a bait-and-switch.

### 3. Add usage metering by feature

Before launch, track per team and per user:

- analyses run
- mentor messages
- total LLM input tokens
- total LLM output tokens
- Firecrawl calls
- queued job count

Without this, you will be pricing on guesses forever.

### 4. Put hard ceilings on chat context growth

Chat is where margin can quietly disappear. The route currently assembles:

- stored history
- project summaries
- recent activity
- tool schemas

This makes every extra turn more expensive. Add:

- capped rolling summaries
- lower-cost model for classification/support turns
- prompt caching where possible
- plan-based monthly message caps

### 5. Make competitor analysis premium-only

It is one of the easiest features to underprice because users perceive it as "just one more click", while it adds scrape cost and extra model passes.

## Suggested Pricing Page Positioning

Lead with outcomes, not token math:

- Free: "See if Recgon understands your product"
- Starter: "Know what to build and how to talk about it"
- Growth: "Run your product and marketing system in one place"
- Team: "Shared founder intelligence for your whole team"

Then show usage limits plainly so power users self-select into the right plan.

## Break-Even View

If your practical fixed-cost floor is about `$60/mo`:

- 4 customers on `$19/mo` = roughly break-even before payment fees
- 2 customers on `$49/mo` = comfortably above break-even
- 1 team on `$149/mo` = enough to absorb infra plus meaningful usage

The business becomes attractive very quickly if you avoid unlimited heavy usage.

## 90-Day Rollout

### Phase 1

- instrument feature-level usage
- add billing entities: plans, subscriptions, usage ledger, credit packs
- replace `analysisQuota` with plan-aware monthly quota checks

### Phase 2

- publish pricing page
- keep free tier but require upgrade for second or third high-value action
- add in-product upgrade prompts after analysis completion

### Phase 3

- launch overages and annual plans
- annual Starter: `$190`
- annual Growth: `$490`
- annual Team: `$1,490`

## Recommended First Version

If you want the simplest profitable v1:

- Free: 1 analysis
- Starter: `$19/mo`
- Growth: `$49/mo`
- Team: `$149/mo`
- Extra analyses sold as credits

That is simple, margin-safe, and consistent with the actual cost profile of this codebase.
