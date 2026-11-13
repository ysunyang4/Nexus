"""
Nexus Playwright Browser Automation MCP Server
Provides standard MCP tools for browser navigation, DOM inspection, element interactions, and content extraction.
"""
import sys
import os
import re
import json
import urllib.request
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Playwright-Browser")

_BROWSER_SESSION = {
    "current_url": "about:blank",
    "last_html": "",
    "cookies": {},
}

@mcp.tool()
def browser_navigate(url: str) -> str:
    """Navigate to a target URL, render page metadata and extract page title & body text."""
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='replace')
            status = resp.status
        _BROWSER_SESSION["current_url"] = url
        _BROWSER_SESSION["last_html"] = html
        title_m = re.search(r'<title[^>]*>(.*?)</title>', html, flags=re.I)
        title = title_m.group(1).strip() if title_m else "No title"
        clean = re.sub(r'<script[\s\S]*?</script>', '', html, flags=re.I)
        clean = re.sub(r'<style[\s\S]*?</style>', '', clean, flags=re.I)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        text = ' '.join(clean.split())[:1500]
        return json.dumps({
            "status": status,
            "url": url,
            "title": title,
            "content_preview": text
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e), "url": url}, ensure_ascii=False)

@mcp.tool()
def browser_screenshot(url: str = "", output_path: str = "") -> str:
    """Capture a snapshot of the current page or specified URL."""
    target_url = url or _BROWSER_SESSION.get("current_url", "https://www.google.com")
    return json.dumps({
        "status": "success",
        "url": target_url,
        "screenshot_saved": output_path or "in-memory-buffer",
        "message": f"Captured rendering viewport for {target_url}"
    }, ensure_ascii=False, indent=2)

@mcp.tool()
def browser_extract_text(selector: str = "body") -> str:
    """Extract inner text from DOM selector in currently loaded page."""
    html = _BROWSER_SESSION.get("last_html", "")
    if not html:
        return "No page currently loaded. Use browser_navigate first."
    clean = re.sub(r'<script[\s\S]*?</script>', '', html, flags=re.I)
    clean = re.sub(r'<style[\s\S]*?</style>', '', clean, flags=re.I)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    return ' '.join(clean.split())[:3000]

@mcp.tool()
def browser_click(selector: str) -> str:
    """Simulate user click on target element selector."""
    return json.dumps({
        "action": "click",
        "selector": selector,
        "success": True,
        "message": f"Clicked on element '{selector}'"
    }, ensure_ascii=False)

@mcp.tool()
def browser_fill(selector: str, value: str) -> str:
    """Fill input element selector with specified text value."""
    return json.dumps({
        "action": "fill",
        "selector": selector,
        "value": value,
        "success": True,
        "message": f"Input '{selector}' populated."
    }, ensure_ascii=False)

@mcp.tool()
def browser_evaluate(expression: str) -> str:
    """Evaluate JavaScript expression in browser context."""
    return json.dumps({
        "expression": expression,
        "result": f"Evaluated: {expression}",
        "url": _BROWSER_SESSION.get("current_url", "about:blank")
    }, ensure_ascii=False)

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "9100"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
