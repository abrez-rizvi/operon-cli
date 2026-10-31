# Open Knowledge Format (OKF v0.3) Specification

OKF v0.3 defines the plain-text Markdown and YAML conventions used by Operon to store skills, knowledge, workflows, sessions, and deterministic policies.

## 1. Markdown Documents (`Skill`, `Knowledge`, `Workflow`)

Every non-reserved Markdown document (`.md`, `.mdc`) must begin with a YAML frontmatter block fenced by `---`:

```yaml
---
type: Skill | Knowledge | Workflow | Session
name: kebab-case-slug
title: Human-Readable Title
description: Concise one-line summary of the document's purpose.
---
```

### Type-Specific Fields
- **`Skill`** (`skills/<name>/SKILL.md` or `skills/<name>.md`):
  - `tags?: string[]` — optional categorization tags.
- **`Workflow`** (`workflows/<name>/WORKFLOW.md` or `workflows/<name>.md`):
  - `triggers?: string[]` — lowercase keywords for deterministic intent classification.
  - `default?: boolean` — fallback workflow when no trigger keywords match.
- **`Knowledge`** (`knowledge/**/*.md`):
  - `paths?: string[]` — optional glob scopes for narrative ADRs/specs.

### Reserved & Supporting Files
- `README.md` and `index.md` are exempt from frontmatter requirements.
- Supporting files inside a skill or workflow directory (alongside `SKILL.md` or `WORKFLOW.md`) are exempt from frontmatter requirements.

## 2. Invariant Ledger (`knowledge/invariants.yaml`)

```yaml
okf: "0.3"
type: InvariantLedger
invariants:
  - code: AUTH-01
    trigger: "\\bauth\\b"
    rule: "Token expiry must be in seconds"
    reason: "Downstream JWT verifier expects Unix epoch seconds"
    paths: ["**/auth/**"]
    author: "alice@example.com"
    timestamp: 1730000000000
```

## 3. Deterministic Policy (`tools/policy.yaml`)

```yaml
okf: "0.3"
type: Policy
ceiling:
  loc: 600
manifests:
  - package.json
debug:
  allow: []
  markers:
    - '\[DEBUG-[^\]]*\]'
```
