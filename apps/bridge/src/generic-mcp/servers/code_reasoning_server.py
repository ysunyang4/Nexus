"""
Nexus Code Reasoning & AST Analysis MCP Server
Provides standard MCP tools for AST structure parsing, complexity estimation, control flow analysis, and refactoring planning.
"""
import sys
import os
import ast
import json
import re
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Code-Reasoning")

@mcp.tool()
def analyze_ast_structure(code: str, language: str = "python") -> str:
    """Analyze Abstract Syntax Tree (AST) of code snippet, extracting classes, functions, and imports."""
    if language.lower() == "python":
        try:
            tree = ast.parse(code)
            classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
            functions = [node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
            imports = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    imports.append(node.module or "")
            return json.dumps({
                "language": "python",
                "classes": classes,
                "functions": functions,
                "imports": list(set(imports)),
                "total_nodes": len(list(ast.walk(tree)))
            }, ensure_ascii=False, indent=2)
        except Exception as e:
            return json.dumps({"language": "python", "error": f"AST parse error: {str(e)}"}, ensure_ascii=False)
    else:
        funcs = re.findall(r'(?:function\s+([a-zA-Z0-9_$]+)|const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\()', code)
        clean_funcs = [f[0] or f[1] for f in funcs if f[0] or f[1]]
        return json.dumps({
            "language": language,
            "detected_functions": clean_funcs,
            "line_count": len(code.splitlines())
        }, ensure_ascii=False, indent=2)

@mcp.tool()
def inspect_code_complexity(code: str) -> str:
    """Calculate lines of code (LOC), branch depth, and estimated cyclomatic complexity."""
    lines = code.splitlines()
    loc = len([l for l in lines if l.strip() and not l.strip().startswith("#") and not l.strip().startswith("//")])
    branches = len(re.findall(r'\b(if|elif|else|for|while|catch|switch|case|\?)\b', code))
    complexity = max(1, branches + 1)
    status = "Low (Clean)" if complexity < 10 else "Moderate" if complexity < 25 else "High (Refactor recommended)"
    return json.dumps({
        "loc": loc,
        "branches_detected": branches,
        "cyclomatic_complexity": complexity,
        "rating": status
    }, ensure_ascii=False, indent=2)

@mcp.tool()
def trace_execution_flow(function_name: str, code: str) -> str:
    """Trace function call relationships and extract control flow branches."""
    calls = re.findall(rf'\b{re.escape(function_name)}\b\s*\(', code)
    inside_def = re.search(rf'def\s+{re.escape(function_name)}\b[^\n]*:([\s\S]*?)(?=\ndef|\nclass|\Z)', code)
    internal_calls = []
    if inside_def:
        body = inside_def.group(1)
        internal_calls = list(set(re.findall(r'\b([a-zA-Z0-9_]+)\(', body)))
    return json.dumps({
        "target_function": function_name,
        "call_sites_found": len(calls),
        "downstream_invocations": internal_calls[:15]
    }, ensure_ascii=False, indent=2)

@mcp.tool()
def detect_code_smells(code: str) -> str:
    """Scan code snippet for common smells (deep indentation, long lines, empty excepts)."""
    smells = []
    lines = code.splitlines()
    for idx, line in enumerate(lines):
        if len(line) > 120:
            smells.append({"line": idx + 1, "type": "long_line", "detail": f"Length {len(line)} > 120"})
        if re.match(r'^\s{16,}', line):
            smells.append({"line": idx + 1, "type": "deep_nesting", "detail": "Indentation exceeds 4 levels"})
        if re.search(r'except:\s*pass', line) or re.search(r'catch\s*\([^)]*\)\s*\{\s*\}', line):
            smells.append({"line": idx + 1, "type": "swallowed_exception", "detail": "Silent error suppression"})
    return json.dumps({
        "total_smells": len(smells),
        "issues": smells[:20]
    }, ensure_ascii=False, indent=2)

@mcp.tool()
def generate_refactoring_plan(code: str, goal: str = "readability") -> str:
    """Generate structured step-by-step refactoring guidelines for targeted code."""
    loc = len(code.splitlines())
    steps = [
        "1. Extract nested business logic into isolated helper functions.",
        "2. Replace magic values with typed constants or configuration parameters.",
        "3. Add explicit return type annotations and runtime guard clauses.",
        "4. Introduce unit tests covering edge conditions before applying AST transforms."
    ]
    if loc > 50:
        steps.insert(0, "0. High LOC detected: Split large block into modular components.")
    return json.dumps({
        "goal": goal,
        "input_loc": loc,
        "suggested_steps": steps
    }, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "9104"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
