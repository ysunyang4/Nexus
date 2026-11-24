import os
import sys

blender_port = os.environ.get("BLENDER_PORT", "9876")
os.environ["BLENDER_PORT"] = blender_port

mcp_port = int(os.environ.get("MCP_PORT", "9099"))

try:
    from blender_mcp.server import mcp
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = mcp_port
    print(f"[Blender MCP Server] Starting Streamable HTTP server on 127.0.0.1:{mcp_port} (Blender socket: {blender_port})", flush=True)
    mcp.run(transport="streamable-http")
except Exception as e:
    print(f"[Blender MCP Server] Error: {e}", file=sys.stderr, flush=True)
    sys.exit(1)
