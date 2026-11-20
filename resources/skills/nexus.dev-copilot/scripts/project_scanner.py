#!/usr/bin/env python3
"""
Nexus Project Scanner (Zero-Dependency)
Scans local development workspace, discovers project topology, manifests, scripts,
tech stack, and git status, outputting structured JSON for AI consumption.
"""

import os
import sys
import json
import subprocess

def detect_tech_stack(root_dir):
    stacks = []
    manifests = {}
    
    # 1. Node.js / TypeScript
    pkg_json = os.path.join(root_dir, "package.json")
    if os.path.isfile(pkg_json):
        try:
            with open(pkg_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                manifests["package.json"] = {
                    "name": data.get("name"),
                    "version": data.get("version"),
                    "scripts": list(data.get("scripts", {}).keys()),
                    "main": data.get("main")
                }
                stacks.append("Node.js")
                if "typescript" in data.get("devDependencies", {}) or "typescript" in data.get("dependencies", {}):
                    stacks.append("TypeScript")
                if "react" in data.get("dependencies", {}):
                    stacks.append("React")
                if "vue" in data.get("dependencies", {}):
                    stacks.append("Vue")
                if "@tauri-apps/api" in data.get("dependencies", {}) or "@tauri-apps/cli" in data.get("devDependencies", {}):
                    stacks.append("Tauri")
        except Exception as e:
            manifests["package.json"] = {"error": str(e)}

    # 2. Rust
    cargo_toml = os.path.join(root_dir, "Cargo.toml")
    if os.path.isfile(cargo_toml):
        stacks.append("Rust")
        manifests["Cargo.toml"] = {"detected": True}

    # 3. Python
    pyproject = os.path.join(root_dir, "pyproject.toml")
    req_txt = os.path.join(root_dir, "requirements.txt")
    if os.path.isfile(pyproject) or os.path.isfile(req_txt):
        stacks.append("Python")
        manifests["Python"] = {
            "has_pyproject": os.path.isfile(pyproject),
            "has_requirements": os.path.isfile(req_txt)
        }

    # 4. Go
    go_mod = os.path.join(root_dir, "go.mod")
    if os.path.isfile(go_mod):
        stacks.append("Go")
        manifests["go.mod"] = {"detected": True}

    return list(set(stacks)), manifests

def get_git_info(root_dir):
    try:
        branch = subprocess.check_output(
            ["git", "-C", root_dir, "rev-parse", "--abbrev-ref", "HEAD"],
            stderr=subprocess.DEVNULL, universal_newlines=True
        ).strip()
        status_lines = subprocess.check_output(
            ["git", "-C", root_dir, "status", "--porcelain"],
            stderr=subprocess.DEVNULL, universal_newlines=True
        ).splitlines()
        return {
            "is_git": True,
            "branch": branch,
            "dirty_files_count": len(status_lines),
            "dirty_summary": status_lines[:8]
        }
    except Exception:
        return {"is_git": False}

def scan_top_level_entries(root_dir):
    try:
        entries = os.listdir(root_dir)
        dirs = []
        files = []
        for e in entries:
            if e in [".git", "node_modules", "target", "dist", "build", ".venv", "__pycache__"]:
                continue
            full = os.path.join(root_dir, e)
            if os.path.isdir(full):
                dirs.append(e)
            else:
                files.append(e)
        return {"directories": sorted(dirs), "files": sorted(files)}
    except Exception as e:
        return {"error": str(e)}

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    root = os.path.abspath(root)

    stacks, manifests = detect_tech_stack(root)
    git_info = get_git_info(root)
    entries = scan_top_level_entries(root)
    has_memory = os.path.isfile(os.path.join(root, "project-memory.md"))

    report = {
        "workspace_root": root,
        "tech_stacks": stacks if stacks else ["Generic/Unknown"],
        "manifests": manifests,
        "has_project_memory": has_memory,
        "git": git_info,
        "structure": entries
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
