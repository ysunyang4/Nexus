"""
Nexus Agentic Workflow & Memory Tools MCP Server
Provides standard MCP tools for project task tracking, subtask decomposition, and persistent agent memories.
"""
import sys
import os
import json
import time
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Agentic-Tools")

_TASKS = []
_MEMORIES = {}

@mcp.tool()
def create_task(title: str, description: str = "", priority: str = "medium") -> str:
    """Create a new agent task with title, description and priority (low, medium, high)."""
    task_id = f"task_{int(time.time() * 1000)}"
    item = {
        "id": task_id,
        "title": title,
        "description": description,
        "priority": priority,
        "status": "pending",
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    _TASKS.append(item)
    return json.dumps(item, ensure_ascii=False, indent=2)

@mcp.tool()
def list_tasks(status: str = "all") -> str:
    """List agent tasks, optionally filtered by status (all, pending, completed)."""
    if status == "all":
        res = _TASKS
    else:
        res = [t for t in _TASKS if t.get("status") == status]
    return json.dumps({"count": len(res), "tasks": res}, ensure_ascii=False, indent=2)

@mcp.tool()
def update_task_status(task_id: str, status: str) -> str:
    """Update task lifecycle status (pending, in_progress, completed, failed)."""
    for t in _TASKS:
        if t["id"] == task_id:
            t["status"] = status
            t["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            return json.dumps({"success": True, "task": t}, ensure_ascii=False)
    return json.dumps({"success": False, "error": f"Task '{task_id}' not found"}, ensure_ascii=False)

@mcp.tool()
def save_agent_memory(key: str, content: str, tags: str = "") -> str:
    """Save an agent memory snippet under a unique key with optional comma-separated tags."""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    _MEMORIES[key] = {
        "key": key,
        "content": content,
        "tags": tag_list,
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    return json.dumps({"success": True, "key": key, "tags": tag_list}, ensure_ascii=False)

@mcp.tool()
def search_agent_memories(query: str) -> str:
    """Search stored agent memories matching keywords in key or content."""
    q = query.lower()
    matches = []
    for k, v in _MEMORIES.items():
        if q in k.lower() or q in v["content"].lower() or any(q in t.lower() for t in v["tags"]):
            matches.append(v)
    return json.dumps({"count": len(matches), "matches": matches}, ensure_ascii=False, indent=2)

@mcp.tool()
def get_project_context(project_name: str = "default") -> str:
    """Get active workspace and agentic context summary."""
    return json.dumps({
        "project": project_name,
        "total_tasks": len(_TASKS),
        "pending_tasks": len([t for t in _TASKS if t["status"] == "pending"]),
        "memory_keys_count": len(_MEMORIES),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "9103"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
