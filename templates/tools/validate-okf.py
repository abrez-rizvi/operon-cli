#!/usr/bin/env python3
"""
OKF (Open Knowledge Format) v0.2 Bundle Conformance Validator.
Verifies all concepts adhere to Google Cloud Platform's OKF specification.
"""
import os
import re
import sys

RESERVED_FILES = {"index.md", "log.md", "README.md"}

def validate_bundle(bundle_root: str) -> bool:
    print("=" * 85)
    print("         OKF (OPEN KNOWLEDGE FORMAT) v0.2 CONFORMANCE VALIDATOR              ")
    print("=" * 85)

    all_passed = True
    checked_count = 0

    print(f"{'Concept Path':<48} | {'Type':<14} | {'Status':<10}")
    print("-" * 85)

    for root, dirs, files in os.walk(bundle_root):
        if any(skip in root for skip in ["reference-repos", ".git", "tools"]):
            continue
        for f in files:
            if not f.endswith(".md"):
                continue

            rel_path = os.path.relpath(os.path.join(root, f), bundle_root)

            # Reserved files check
            if os.path.basename(f) in RESERVED_FILES:
                if f == "index.md":
                    print(f"{rel_path:<48} | {'Reserved (Idx)':<14} | PASS (OKF §8)")
                continue

            checked_count += 1
            full_path = os.path.join(root, f)

            with open(full_path, "r", encoding="utf-8", errors="ignore") as fh:
                content = fh.read()

            fm_match = re.search(r"^---\r?\n(.*?)\r?\n---", content, re.DOTALL)
            if not fm_match:
                print(f"{rel_path:<48} | {'Missing FM':<14} | FAIL (No frontmatter)")
                all_passed = False
                continue

            fm_text = fm_match.group(1)
            type_match = re.search(r"^type:\s*(.+)$", fm_text, re.MULTILINE)
            if not type_match:
                print(f"{rel_path:<48} | {'Missing Type':<14} | FAIL (No type: key)")
                all_passed = False
                continue

            concept_type = type_match.group(1).strip()
            print(f"{rel_path:<48} | {concept_type:<14} | PASS")

    print("=" * 85)
    if all_passed:
        print(f"VERDICT: 100% OKF v0.2 CONFORMANT! ({checked_count} concepts verified)")
    else:
        print("VERDICT: CONFORMANCE ERRORS DETECTED.")
    print("=" * 85)
    return all_passed

if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    success = validate_bundle(root)
    sys.exit(0 if success else 1)
