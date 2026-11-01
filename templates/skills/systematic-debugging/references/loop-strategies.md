---
type: Reference
title: Feedback Loop Construction Strategies
description: 10 concrete strategies to build automated, red-capable reproduction loops.
tags: [debugging, reproduction, testing, feedback-loops]
---

# Feedback Loop Construction Strategies

A debugging loop must be fast, deterministic, and unattended. Use the first strategy that reaches the bug:

1. **Failing Unit / Integration Test:** The gold standard. Add a targeted test case asserting the expected behavior.
2. **Curl / HTTP Dev-Server Script:** Hit an active local service with the problematic request payload and check status/body.
3. **CLI Invocation with Fixtures:** Run the CLI with specific arguments or piped input, asserting on stdout or exit code.
4. **Headless Browser Script (Playwright / Puppeteer):** For frontend UI state bugs, drive user actions and assert on DOM or network responses.
5. **Captured Trace Replay:** Save real network requests, webhook bodies, or database states to disk and replay them in isolation.
6. **Isolated Throwaway Harness:** Create a single test script importing only the problematic service/module with mocked external boundaries.
7. **Property / Fuzz Loop:** For intermittent or edge-case bugs, generate 1,000 randomized inputs in a loop until the assertion trips.
8. **Automated Bisection (`git bisect run`):** When a regression appeared between known commits, write a check script and let git bisect locate the offending commit.
9. **Differential Loop:** Run the same input across two configurations (or two git branches) and diff the outputs.
10. **Human-in-the-Loop Script:** As a last resort, write a script that prompts the human for explicit click steps and collects the logs automatically.

---

## Tightening Checklist
- [ ] Runs in under 5 seconds.
- [ ] Produces identical result on 10 consecutive runs.
- [ ] Asserts on the specific symptom, not a generic "did not crash".
