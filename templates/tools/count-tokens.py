#!/usr/bin/env python3
"""
Audits token overhead and context footprint across all skills and workflows in the repository.
"""
import os
import re
import sys

def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    # Standard multi-tokenizer average (Gemini/Claude/GPT-4): ~3.8 characters per token
    return round(len(text) / 3.8)

def extract_frontmatter(content: str) -> tuple[str, str]:
    match = re.search(r"^---\r?\n(.*?)\r?\n---\s*(.*)$", content, re.DOTALL)
    if match:
        return match.group(1), match.group(2)
    return "", content

def audit_catalog(workspace_root: str):
    skills_dir = os.path.join(workspace_root, "skills")
    workflows_dir = os.path.join(workspace_root, "workflows")

    print("=" * 85)
    print("               AGENT SKILLS & WORKFLOWS TOKEN AUDIT                   ")
    print("=" * 85)

    # 1. Audit Skills
    total_skill_disc = 0
    total_skill_active = 0
    total_skill_ref = 0
    total_scripts = 0

    if os.path.isdir(skills_dir):
        print(f"\n[SKILLS CATALOG] (Atomic Capabilities)")
        print(f"{'Skill Name':<24} | {'Discovery':<12} | {'Active Body':<14} | {'References':<14} | {'Scripts':<10}")
        print("-" * 85)

        for s in sorted(os.listdir(skills_dir)):
            s_path = os.path.join(skills_dir, s)
            if not os.path.isdir(s_path):
                continue
            skill_md = os.path.join(s_path, "SKILL.md")
            ref_dir = os.path.join(s_path, "references")
            script_dir = os.path.join(s_path, "scripts")

            disc, active, ref, scripts = 0, 0, 0, 0

            if os.path.isfile(skill_md):
                with open(skill_md, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                fm, body = extract_frontmatter(content)
                disc = estimate_tokens(fm)
                active = estimate_tokens(body)

            if os.path.isdir(ref_dir):
                for rf in os.listdir(ref_dir):
                    if rf.endswith(".md"):
                        with open(os.path.join(ref_dir, rf), "r", encoding="utf-8", errors="ignore") as f:
                            ref += estimate_tokens(f.read())

            if os.path.isdir(script_dir):
                scripts = len([f for f in os.listdir(script_dir) if os.path.isfile(os.path.join(script_dir, f))])

            total_skill_disc += disc
            total_skill_active += active
            total_skill_ref += ref
            total_scripts += scripts

            print(f"{s:<24} | ~{disc:<10} | ~{active:<12} | ~{ref:<12} | {scripts} script(s)")

    # 2. Audit Workflows
    total_wf_disc = 0
    total_wf_active = 0

    if os.path.isdir(workflows_dir):
        print(f"\n[WORKFLOWS CATALOG] (Sequenced Skill Bundles)")
        print(f"{'Workflow Name':<24} | {'Discovery':<12} | {'Active Body':<14} | {'Bundled Pipeline':<25}")
        print("-" * 85)

        for w in sorted(os.listdir(workflows_dir)):
            w_path = os.path.join(workflows_dir, w)
            if not os.path.isdir(w_path):
                continue
            wf_md = os.path.join(w_path, "WORKFLOW.md")
            disc, active = 0, 0

            if os.path.isfile(wf_md):
                with open(wf_md, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                fm, body = extract_frontmatter(content)
                disc = estimate_tokens(fm)
                active = estimate_tokens(body)

            total_wf_disc += disc
            total_wf_active += active

            print(f"{w:<24} | ~{disc:<10} | ~{active:<12} | Multi-phase sequence")

    print("=" * 85)
    print("BUDGET COMPLIANCE SUMMARY:")
    print(f"  • Global Discovery Tax:  ~{total_skill_disc + total_wf_disc} tokens total (Skills: ~{total_skill_disc}, Workflows: ~{total_wf_disc})")
    print(f"    Target: <= 60 tokens/item (Threshold: <= 1,200 tokens across library)")
    print(f"  • Deterministic Code:    {total_scripts} local scripts (0 prompt tokens)")
    print("=" * 85)

if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    audit_catalog(root)
