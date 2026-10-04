# Leakage

**Revenue protection for mobility payments.** Robotaxi rides and Supercharging are paid for *after* the service. Every new way to pay (Apple Pay, Google Pay, X Money, kiosks, partner charge cards) adds another place money can fail, go missing, or go unpaid. Leakage finds it and gets it back.

> All data is simulated. Payment methods and flows are modeled on what Tesla shows publicly. Nothing reflects Tesla internal data.

## What it does

| Leak | What Leakage does |
|---|---|
| **Failed payments** | Picks the best recovery steps for each decline (retry timing, backup card, rider message). Never retries dead or stolen cards. |
| **Unpaid accounts** | Ranks riders and partner invoices by money at risk, drafts friendly outreach, sends disputes and fraud to a person. |
| **Money mismatches** | Compares every charge with what each provider paid, explains each mismatch, suggests a fix. |
| **Ask Leakage** | An AI assistant (Claude with tool calling) that answers questions and suggests actions. A person approves everything. |

On a simulated week of 10,000 payments: smart recovery gets back about **3x** what plain retries do, with **zero** card-network rule violations (plain retries: 354).

## Project layout

```
src/core.js      Engine: simulated data, recovery policy, reconciliation, collections, guardrails, evals (no UI)
src/index.html   Page layout and styles
src/ui.js        Interface and the AI assistant
tests/           Automated tests (node --test)
build.js         Bundles everything into one file: dist/index.html
vercel.json      Deploy settings for Vercel
```

## Run it

```bash
npm test          # run the tests (Node 18+)
npm run build     # build dist/index.html
```

Open `dist/index.html` in a browser, or deploy to Vercel (settings are in `vercel.json`). Everything works offline except the AI assistant, which runs when the page is opened inside Claude.

## How the AI is used

- **Smart recovery:** scores each recovery option from decline reason, payment method, and rider history. Hand-tuned now; designed to become a trained model (gradient-boosted trees) on real data.
- **Money matching:** deterministic rules with tolerances. Deliberately not a language model: money records must be exact and repeatable.
- **Collections priority:** amount x chance it stays unpaid x lateness.
- **Assistant and messages:** Claude with tool calling. Read-only lookup tools plus one `suggest_action` tool that goes through guardrails and human approval.
- **Guardrails:** no retries on hard declines, max 3 attempts, refunds over $100 and write-offs over $25 need approval.
- **Evals:** 18 golden cases the decision logic must pass on every change.

## What I would do with real data

1. Train the recovery model on historical declines and measure lift with an A/B holdout.
2. Connect reconciliation to real processor settlement files per rail.
3. Add an evaluation set for the assistant's answers, not just the decision logic.
