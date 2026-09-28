# Mobile-agent tooling: keep Argent, no portability layer

Decided 2026-09-23 (#260). Coding agents drive the app on devices through **Argent**, pinned exactly in `package.json`, with its skills vendored under `.agents/skills/`. We **do not** build a universal device-automation wrapper or a provider registry, and we **do not** add a new shared workflow skill. The coupling that exists is fixed in place with small maintenance changes: verification outcomes are separated from Argent's procedure (#261), the setup checker is split by responsibility and gains a pin/skill-ref alignment guard (#262), the stale replay path is retired (#221), and the release gap is reviewed on purpose (#263, which upgraded the pin from `0.20.0` to `0.25.2` in #267).

#260 is the deliberation record: independent proposals from Claude and Codex, cross-reviews, a jointly edited [candidate revision 1](https://github.com/git-sparrow/kavtsya/issues/260#issuecomment-5792801763), and separate endorsements ([Codex](https://github.com/git-sparrow/kavtsya/issues/260#issuecomment-5792807440), [Claude](https://github.com/git-sparrow/kavtsya/issues/260#issuecomment-5792941523)). This ADR owns the decision. The thread keeps the argument that led to it.

## Why deferring is cheap

The question was whether to pay now so that a later move from Argent to agent-device, or to another provider, is practical. It turned out that exit cost is already low, for structural reasons that will not decay:

- **The vendoring wiring has no device concepts.** `grep -cEi "tap|swipe|screenshot|simulator|emulator|device" scripts/check-agent-setup.mjs` returns `0` (re-checked 2026-09-28, after the #262 split). The wiring is a file-synchronisation policy for one vendor's way of distributing instruction files. It is not an abstraction over device automation, so a portability layer would have exactly one implementation.
- **Semantic coupling to Argent in `apps/` is zero.** Every mention is a comment that points a reader at where a surface gets verified (re-checked 2026-09-28). Changing provider would be a tooling migration, not an application rewrite.
- **The providers differ mainly in how they distribute agent guidance.** Argent ships its skills and rules inside the npm tarball for the consumer to vendor and pin. agent-device ships none (`npm pack agent-device --dry-run` on 2026-09-23: 553 files, zero skill files) and distributes them separately.

## Corrections made along the way

An ADR that records only the winning argument is a worse record, so here is where each side was wrong:

- **Alignment is not freshness (`D1`).** Claude proposed that the #262 pin/ref check would catch upstream staleness. It cannot: it only asserts that the declared package and skill refs match each other. Adopting a new release is a separate, deliberate review, which is what #263 did.
- **The `.argent/flows/` recordings are stale, not rule-violating (`D2`).** They meet the documented conditions for keeping coordinates: an echo naming the target, plus a hard check. Claude's contrary claim was withdrawn. The reason to retire them is staleness, tracked in #221.
- **Two flow systems are a policy, not a defect.** `docs/argent-howto.md` ("Argent flows vs the Maestro gallery") gives Argent flows and the Maestro suite separate jobs on purpose. Nothing is consolidated.
- **Adopting agent-device would not force a worse setup (`D3`).** It supports project-local, lockfile-pinned installs and its own MCP server, so "global install, no repo guidance, a Bash prompt per command" is not a necessary cost of choosing it.
- **Every capability claim, on both sides, is documentation-level**, checked 2026-09-23. No device was started during the discussion. None of this is parity evidence.

## What would change our mind

Revisit when any of these holds. Each can hold **at any time**; a post-pilot review is an opportunity, not a prerequisite (`D4`):

- a specific verification capability we need and Argent cannot provide;
- a reproducible tooling blocker to required work;
- recorded, recurring upgrade or maintenance cost;
- a concrete source, licence or distribution requirement.

When one fires, run the **smallest useful experiment**. Name both exact versions, use the same app commit and controlled fixtures, and run the triggering scenario once per candidate to find blockers. Expand only if choosing an alternative is still a live option. The result is exploratory evidence, not a reliability verdict. If a fix in the current tool removes the blocker, stop there.

Related open questions have their own homes. This ADR links them rather than restating them: the replay-path and build cleanup (#221), behavioural failures in the Maestro flows (#169, #249), and running E2E in CI and on Android (#246).

## Considered and rejected

**A provider-neutral wrapper or provider registry.** Rejected because it would have one implementation and would abstract over coupling that the evidence above shows barely exists.

**A new shared mobile-workflow skill.** Rejected because it would duplicate `verify/SKILL.md` and the Argent skills. Separating outcomes from procedure inside the existing file (#261) gets the benefit without a new instruction hierarchy.

**A broad Argent-vs-agent-device A/B programme now.** Rejected because no trigger has fired, so it would buy evidence for a decision nobody currently needs to make.
