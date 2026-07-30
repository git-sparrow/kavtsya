# Exploration — a fixed hardware QR scanner at the counter («Стійка», revisited)

> **Status: exploration, not a decision.** Brainstorm from 2026-07-31 on evolving
> the counter experience with dedicated scanning hardware (reference device:
> Datalogic Gryphon 4500 Fixed Series). ADR 0013 already considered and rejected
> "dedicated scanner hardware / kiosk-first" for v1, keeping the kiosk «Стійка»
> as a later reuse of the Shift primitive — this doc explores what that later
> stage would actually cost and when it becomes worth it. Related: ADR 0006
> (dynamic QR), ADR 0013 (Barista Roster + Shift), issue #61 (flipped QR
> direction), issue #62 (per-barista PINs on a shared device).

## The proposal

A CafeOwner installs a fixed QR scanner at the counter. Customers self-scan
their rotating QR from the app; the barista on Shift sees the successful scan,
approves it, and can add extra Зернятка manually when the Purchase covered more
than one drink. Motivations, in order of weight: baristas should not need a
personal phone in the scan loop, the counter flow should be faster during rush,
and a physical branded device gives the Café (and Kavtsya) presence.

## TL;DR verdict

The underlying problem is real, but the fix decomposes into two parts and only
one of them is expensive:

1. **A shared counter device** — the actual fix for the personal-phone concern.
   A ~$120–160 Android tablet running Scanner Mode, signed in by the rostered
   barista at shift start (the ADR 0013 poster scan works unchanged on a shared
   device). Software we mostly already have.
2. **A dedicated scan engine** — a nice-to-have accelerator. A $30–60
   presentation scanner (NETUM A5/A6 class) covers it. The **Gryphon 4500 at
   ~$310 street** is the right part for the wrong stage: it is built for OEM
   kiosk integrators shipping hundreds of units, with IP54 sealing and a 5-year
   warranty we would pay for but not yet need.

**Recommendation:** no industrial hardware now. If the counter experience needs
work, build a "Counter mode" tablet layout for Scanner Mode with optional cheap
USB scanner input, and revisit Gryphon-class (or custom «Стійка») hardware as a
leased Pro-tier device at ~100+ Café scale.

## What is already decided (and what this proposal would touch)

- **ADR 0006 — dynamic QR.** The rotating, single-use signed token already
  neutralises screenshot replay, which is the main fraud surface a self-scan
  flow opens. The barista-approval step in this proposal does real security
  work on top (it is the human "a Purchase happened" check), so it can never be
  quietly automated away without a substitute control. The offline stance also
  carries over: the counter device inherits the "owner device is online"
  assumption — but a tablet on café Wi-Fi is *less* reliable than a phone on
  mobile data, so a designed offline/queue story would become more urgent, not
  less.
- **ADR 0013 — Barista Roster + Shift.** The staff-access problem is solved
  without new account types, and the decided design deliberately runs Scanner
  Mode on the barista's **own** phone. The "baristas don't want to use personal
  phones" motivation is therefore a challenge to an accepted trade-off — worth
  collecting real pilot signal on, not re-deciding from intuition. Importantly,
  the Shift primitive already supports a shared device: a rostered barista
  signs into the counter tablet and scans the wall poster to start their Shift
  there. Simultaneous multi-barista attribution on one device is exactly
  issue #62 (Pro-tier PINs), not new scope invented here.
- **Issue #61 — flipped QR direction.** The complementary experiment (Café
  displays the rotating QR, Customer scans) removes staff from *earning*
  entirely but loosens the trust model. This proposal keeps ADR 0006's trust
  direction and keeps the human check. The two explorations share one
  conclusion: some counter display/device softens the "no hardware" wedge, so
  whichever runs first should reuse the same cheap-tablet footprint.

## Key insight: the scanner does not remove the staff device

Walk the proposed flow carefully: customer self-scans → barista **approves and
adjusts the Зернятка count**. That approval needs a screen. A fixed scanner
does not eliminate the staff-side device — it adds a customer-facing one next
to it. If approval lives on the barista's phone, the stated concern is not
solved at all. If it lives on a shared counter tablet, the tablet is doing the
heavy lifting — and the question becomes "what is the cheapest reliable scan
input for that tablet", which is where a $300 module stops justifying itself.

What a fixed scanner honestly buys over a tablet camera:

- **Speed and reliability on phone screens.** The Gryphon's motion tolerance
  and screen-reading optics are best-in-class — first-pass reads of moving,
  dim, cracked screens. Tablet cameras are noticeably worse; cheap presentation
  scanners sit in between. Software claws back most of the gap: force max
  brightness and a light background on the Customer QR screen (dark-mode QRs
  are a known scanner killer).
- **Hands-free ergonomics.** The Customer presents; nobody aims anything.
  Matters during rush.
- **Durability.** IP54 against milk steam and syrup, disinfectant-ready enclosure,
  5-year warranty. A $40 scanner in a café dies in 1–3 years — but replacing a
  $40 unit is cheaper than insuring against it with a $310 one.

## Two architectures for hosting the approval screen

**A. Tablet host (the viable one).** The scanner plugs into the tablet over USB
in HID-keyboard mode and "types" the token payload into a listening Counter
view inside Scanner Mode. The scan appears as a pending card; the barista taps
approve and can bump the count for a multi-drink Purchase. The backend barely
changes — same purchase route, same server-side "rostered + active Shift"
check on every scan. Degrades gracefully: the tablet camera alone works if the
Café skips the scanner.

**B. Headless bridge (skip).** A single-board computer posting scans to the
API, with approval elsewhere, fails the goal: the approval surface is still
someone's phone, and it drags in a hardware-fleet discipline — device
registration and pairing, an on-device agent, OTA updates, health monitoring,
offline queueing, per-device secrets. That is 2–3 months of engineering plus
permanent ops, versus ~2–4 weeks for Architecture A, and it is exactly the
"hardware/provisioning business" ADR 0013 declined to become. It only makes
sense in a future branded-«Стійка» world.

## Cost model

Per-unit hardware, landed in Ukraine (add roughly 20% VAT plus import handling
to US street prices):

| Build                     | Components                                                        |                  Landed cost |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------: |
| Tablet only (camera scan) | Android tablet + stand + cabling                                  |                   ~$140–200 |
| Budget scanner build      | Tablet + NETUM-class presentation scanner + stand                 |                   ~$180–260 |
| Gryphon build             | Tablet + GFS4520 (~$310 US street, ~$380–450 landed) + mount      |                   ~$520–650 |
| Custom «Стійка» kiosk     | GFE4500 "naked" module + SBC + enclosure; BOM ~$400+, real cost is 4–6 months of engineering, certification, provisioning, and permanent fleet ops | a business line, not a cost |

Software build (our side):

| Scope                                                                                              |                Estimate |
| -------------------------------------------------------------------------------------------------- | ----------------------: |
| Counter view in Scanner Mode: HID capture + pending-approval UI + manual Зернятка adjustment        |              ~2–4 weeks |
| Per-barista PINs on the shared device (issue #62, Pro)                                              |              +2–4 weeks |
| Headless-bridge fleet infrastructure                                                                | +2–3 months + ongoing ops |

Payback, assuming Ukrainian Café SaaS pricing around ₴400–900/month (~$10–22,
ADR 0011 freemium) and a +$12/month Pro uplift when Kavtsya provides hardware:

| Model                                        | Ask / payback                               | Read                             |
| -------------------------------------------- | ------------------------------------------- | -------------------------------- |
| CafeOwner pays — Gryphon build               | $520+ upfront ≈ 2+ years of their subscription | non-starter                      |
| CafeOwner pays — BYOD tablet + ~$50 scanner  | ≤ ~$100, often $0 (spare tablet exists)     | easy yes                         |
| Kavtsya provides — budget build              | ~15–22 months payback                       | marginal; workable with a deposit |
| Kavtsya provides — Gryphon build             | ~45+ months payback                         | negative unit economics          |

Subsidised counter hardware is the Fivestars playbook — it consumed enormous
venture capital before that company sold. Carrying hardware capex, RMA
logistics across Ukraine, and wartime import risk is a serious drag at this
stage. Adoption survives only if the required Café spend is ≤ ~$100 or
bring-your-own-device.

## Honest ledger

Pros beyond the obvious:

- **Counter presence is an acquisition channel.** A branded device advertises
  Kavtsya to every customer in line — arguably worth more than the scan-speed
  gain, and it doubles as the onboarding QR surface (#61 notes the same).
- **Scan-while-waiting.** The Customer scans from the queue; the barista
  batch-approves. Genuinely better rush-hour flow than interrupting drink-making.
- **Proof of presence.** A scan from a fixed device at a known Café is a strong
  anti-fraud signal and cleaner analytics than a phone that could be anywhere.
- **Future surface.** The same tablet later hosts self-Redemption, a Ворожка
  moment, owner stats — the device earns its counter space over time.

Cons, hidden ones included:

- **Counter space and grime.** Counters are contested, wet, sticky. Devices get
  moved, unplugged, splashed, stolen. Every unit generates support tickets.
- **Connectivity dependency.** See ADR 0006 note above — café Wi-Fi is the
  flakiest link, and the counter device sits on it.
- **Self-scan enlarges the replay window socially.** ADR 0006's rotating
  single-use token holds technically, but an unattended self-serve scanner
  invites "scan for a friend in line" gaming that a barista-held scan
  discourages; the approval step is the control.
- **Accessibility.** A fixed scanner has a fixed height and reach; a barista
  holding a phone meets the Customer where they are. Per the product bar, the
  counter flow needs a designed fallback (camera scan, or barista-initiated
  member-code entry per ADR 0006) so a wheelchair user never gets a worse path.
- **Concept count.** Device setup, counter mode, possibly PINs — each is a new
  concept a CafeOwner must hold; hardware pushes against "simple = fewest
  concepts".
- **Android fragmentation** under BYOD: USB-OTG quirks, aggressive battery
  killers, ancient OS versions. Mitigate with a short recommended-devices list,
  not universal support.

## Staged recommendation

1. **Now (zero build).** The decided ADR 0013 model already keeps the
   CafeOwner's phone out of daily scanning; a Café that objects to barista
   personal phones can dedicate any cheap Android device today — the barista
   signs in and poster-scans a Shift on it. Costs a docs page ("recommended
   counter setup"), and pilots tell us how real the personal-phone objection is.
2. **Fast follow (~2–4 weeks, if pilots confirm demand).** A Counter view in
   Scanner Mode designed for a mounted tablet: camera scanning plus HID scanner
   input, pending-approval cards, multi-drink adjustment. Recommend a specific
   ~$50 presentation scanner. This delivers ~90% of the Gryphon vision at ~⅓ of
   the hardware cost with no new backend device class. Defer per-barista
   attribution to #62.
3. **Later (~100+ Cafés, proven Pro demand).** Revisit a leased, branded
   «Стійка» — this is the stage Gryphon-class modules (or the naked GFE4500 in
   a custom enclosure) are actually designed for; the datasheet's own target
   list (kiosks, turnstiles, OEM integrators) says who the customer is, and it
   is not Kavtsya yet.

## Sources

- [Logiscenter — Datalogic GFS4520-BKK1-RED (~$310, MSRP $484)](https://www.logiscenter.us/datalogic-gfs4520-bkk1-red-scanner)
- [Logiscenter — Datalogic GFS4520-BK-RED (~$313, MSRP $462)](https://www.logiscenter.us/datalogic-gfs4520-bk-red-scanner)
- [CompSource — GFS4520-BKK1-WHT (~$304)](https://www.compsource.com/buy/GFS4520BKK1WHT/Datalogic-2402)
- [CDW — Gryphon GFS4520 listing](https://www.cdw.com/product/datalogic-gryphon-gfs4520-white-illumination-2d-fixed-scanner-black/7857172)
- [Datalogic — OEM barcode readers family page](https://www.datalogic.com/eng/automatic-data-capture/oem-barcode-readers-pc-24.html)
- Datalogic Gryphon 4500 Fixed Series datasheet, rev. C (2024-07-17) — GFS4520/GFS4550/GFS4590/GFE4590 specs
- [NETUM — hands-free desktop presentation scanners (A5 / A6 / NT-5090 class)](https://www.netum.net/collections/hands-free-scanners)
- [NETUM NT-5090 on Amazon](https://www.amazon.com/NETUM-Payment-Scanner-Desktop-Supermarket/dp/B0C5J25B35)
- [BonusQR — café loyalty tooling landscape 2026](https://bonusqr.com/article/top-6-loyalty-tools-for-cafes-2026)
