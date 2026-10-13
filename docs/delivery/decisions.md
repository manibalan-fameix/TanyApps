# Decisions and assumptions

| # | Decision or assumption | Reason |
|---|---|---|
| D1 | Sprint 1 starts Monday 2026-10-12 and ends Friday 2026-10-23. | Start date was left as FILL IN. Today is Thursday 2026-10-08, so the next Monday is the earliest clean start. |
| D2 | Pavi: 60% dev, 40% marketing. Her dev capacity is 6 of 10 working days (about 8 points). | Default given in the prompt. |
| D3 | The restaurant module is in the repo, untracked, and is not part of "Tany used-car dealer OS". I put it in its own epic (E10), Backlog, unscheduled, with one decision story for Bala. | It is built far past a stub (58 order tests). Dropping it loses work and scheduling it competes with the first paying dealer. **Bala to decide.** Recommendation: keep it, park it, commit it, and treat it as the seed of Showfood. |
| D4 | Capacity per 2-week sprint: Gokul 20 points, Pavi 8 (dev), Mala 20 (QA/BA work), Bala 8. | Gokul keeps 20% for review and releases. Assumed 1 point is about half a working day. Adjust after sprint 1 actuals. |
| D5 | Team members have no ClickUp names or emails yet. Tasks will be assigned by first name, then re-mapped once Bala supplies them. | FILL IN not completed. |
| D6 | "Built" stories go to QA assigned to Mala, one per flow, not one per file. | Keeps the call budget workable. |
| D7 | Priority rule: Urgent = a dealer cannot go live or pay without it. High = a dealer would notice in week one. Normal = needed for growth. Low = later. | Matches the prompt's ranking by what blocks go-live and payment. |
| D8 | Buyer enquiry capture (S15) ranks Urgent even though the leads table exists. | Leads are written only by a paid booking, and booking is blocked on Razorpay Route. A first dealer would get zero leads. |
| D9 | Landing-page story is a product story (design by Bala, build by Pavi dev time). Marketing campaign tasks are not created. | Prompt says marketing and sales tasks are created only on request. |
| D10 | Bugs found while verifying are filed in the Bugs list by Mala, owner Gokul. None are pre-filed. | I have not run the app; I will not invent bugs from reading code. |
| D11 | ClickUp tools are not visible in my current tool list. | Phase 3 cannot start until the ClickUp connector is attached. Plan is written to survive that. |
| D12 | Pricing (2999 / 4999 / 8999 per month, 30-day trial, free plan with 5 cars) is treated as current but unconfirmed. | In `lib/plans.ts` only. Bala to confirm before live billing (story S28). |
| D13 | Story points: 1 = under half a day, 2 = about 1 day, 3 = 1-2 days, 5 = 3 days, 8 = about a week. | Keeps estimates comparable. |
