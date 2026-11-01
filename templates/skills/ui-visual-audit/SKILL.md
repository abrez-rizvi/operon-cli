---
type: Skill
name: ui-visual-audit
title: UI Visual & Layout Audit
description: >-
  Inspects rendered UI layout geometry, screen real-estate bounds, and visual hierarchy.
  Triggers on UI/frontend changes, layout bugs, "looks weird", or visual regressions.
tags: [ui, layout, visual-audit, accessibility, frontend]
---

# UI Visual & Layout Audit

Verify visual presentation and layout geometry deterministically before presenting UI work to the user.

---

## The Verification Ladder

Never declare UI work complete based solely on unit tests. Run through the visual gates:

1. **Screen Real-Estate Ratios:**
   - Headers/top bars must not consume > 15–18% of vertical viewport height.
   - Footers/bottom bars must not occlude primary content or overlap floating elements.
2. **Boundary & Overlay Bleed:**
   - Vignettes, gradients, and scrims must be scoped to their target container. Never let a root overlay bleed across sibling views or headers.
3. **Density & Hierarchy:**
   - Verify padding, spacing consistency, and touch targets (minimum 48x48 dp).
   - Check text truncation, line wrapping, and dynamic content scaling.
4. **Media Scaling:**
   - Ensure image/video containers maintain native aspect ratios (center-crop or fit-center matrix). Never stretch or distort video/thumbnails.

---

## Non-Negotiable Guardrails

- **Capture & Inspect:** On mobile/web, capture a screenshot or layout hierarchy dump (`adb shell screencap` or browser devtools) to verify layout bounds before claiming completion.
- **Reference Contrast:** When reference screenshots or videos are provided in the repo, compare layout density and element placement directly against the reference frames.
