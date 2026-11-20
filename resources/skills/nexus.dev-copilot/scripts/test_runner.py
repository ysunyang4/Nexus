#!/usr/bin/env python3
"""
Nexus Test & Build Runner Wrapper
Runs tests or builds, captures stdout/stderr, extracts line errors,
and formats results into a structured JSON payload for autonomous AI self-healing.
"""

import os
import sys
import time
import json
import subprocess

def run_command_with_telemetry(cmd, cwd):
    start = time.time()
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        stdout, stderr = proc.communicate(timeout=180)
        duration_ms = int((time.time() - start) * 1000)
        return {
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "duration_ms": duration_ms
        }
    except subprocess.TimeoutExpired:
        proc.kill()
        return {
            "exit_code": -1,
            "stdout": "",
            "stderr": "Command execution timed out after 180 seconds.",
            "duration_ms": 180000
        }
    except Exception as e:
        return {
            "exit_code": -2,
            "stdout": "",
            "stderr": str(e),
            "duration_ms": int((time.time() - start) * 1000)
        }

def extract_error_lines(stderr, stdout):
    combined = (stderr + "\n" + stdout).splitlines()
    error_lines = []
    keywords = ["error:", "error[", "failed", "exception", "syntaxerror", "typeerror", "cannot find", "not satisfied"]
    for line in combined:
        clean = line.strip()
        if any(kw in clean.lower() for kw in keywords):
            error_lines.append(clean)
    return error_lines[:15]

def auto_detect_command(cwd):
    if os.path.isfile(os.path.join(cwd, "pnpm-lock.yaml")):
        return "pnpm test"
    if os.path.isfile(os.path.join(cwd, "package.json")):
        return "npm test"
    if os.path.isfile(os.path.join(cwd, "Cargo.toml")):
        return "cargo test"
    if os.path.isfile(os.path.join(cwd, "pyproject.toml")) or os.path.isfile(os.path.join(cwd, "requirements.txt")):
        return "pytest"
    if os.path.isfile(os.path.join(cwd, "go.mod")):
        return "go test ./..."
    return "npm test"

def main():
    cwd = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    cmd = sys.argv[2] if len(sys.argv) > 2 else auto_detect_command(cwd)

    result = run_command_with_telemetry(cmd, cwd)
    success = (result["exit_code"] == 0)
    errors = [] if success else extract_error_lines(result["stderr"], result["stdout"])

    payload = {
        "command": cmd,
        "cwd": cwd,
        "success": success,
        "exit_code": result["exit_code"],
        "duration_ms": result["duration_ms"],
        "error_highlights": errors,
        "raw_stdout_sample": result["stdout"][-1000:] if result["stdout"] else "",
        "raw_stderr_sample": result["stderr"][-1000:] if result["stderr"] else ""
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
