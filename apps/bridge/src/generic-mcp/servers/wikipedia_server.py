"""
Nexus Wikipedia Knowledge MCP Server
Provides standard MCP tools for searching Wikipedia, fetching article summaries, and full content extraction.
"""
import sys
import os
import json
import urllib.request
import urllib.parse
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Wikipedia-Knowledge")

USER_AGENT = "NexusKnowledgeBot/1.3 (https://nexus.ai; contact@nexus.ai)"

@mcp.tool()
def search_wikipedia(query: str, limit: int = 5) -> str:
    """Search Wikipedia for articles matching the query. Returns titles and descriptions."""
    params = urllib.parse.urlencode({
        "action": "opensearch",
        "search": query,
        "limit": min(limit, 10),
        "namespace": "0",
        "format": "json"
    })
    url = f"https://en.wikipedia.org/w/api.php?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        titles = data[1] if len(data) > 1 else []
        descs = data[2] if len(data) > 2 else []
        links = data[3] if len(data) > 3 else []
        results = []
        for i in range(len(titles)):
            results.append({
                "title": titles[i],
                "description": descs[i] if i < len(descs) else "",
                "url": links[i] if i < len(links) else ""
            })
        return json.dumps(results, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)

@mcp.tool()
def get_wikipedia_summary(title: str) -> str:
    """Get the introductory summary of a specific Wikipedia article."""
    encoded_title = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return json.dumps({
            "title": data.get("title", title),
            "description": data.get("description", ""),
            "extract": data.get("extract", "No extract available."),
            "url": data.get("content_urls", {}).get("desktop", {}).get("page", "")
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)

@mcp.tool()
def get_wikipedia_article(title: str) -> str:
    """Get full plaintext content of a Wikipedia article."""
    params = urllib.parse.urlencode({
        "action": "query",
        "prop": "extracts",
        "explaintext": "true",
        "titles": title,
        "format": "json"
    })
    url = f"https://en.wikipedia.org/w/api.php?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        pages = data.get("query", {}).get("pages", {})
        for _, page in pages.items():
            return page.get("extract", "Article content not found.")
        return "Article not found."
    except Exception as e:
        return f"Error fetching article: {e}"

@mcp.tool()
def get_random_wikipedia_article() -> str:
    """Fetch a random Wikipedia article summary."""
    url = "https://en.wikipedia.org/api/rest_v1/page/random/summary"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return json.dumps({
            "title": data.get("title", ""),
            "extract": data.get("extract", "")
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "9108"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
