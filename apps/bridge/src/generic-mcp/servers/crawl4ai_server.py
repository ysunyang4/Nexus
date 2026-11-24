"""
Nexus Crawl4ai Fast Web Extractor MCP Server
Provides standard MCP tools for fast webpage crawling, markdown dehydration, and structured text extraction.
"""
import sys
import os
import re
import json
import urllib.request
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Crawl4ai-Dehydrator")

@mcp.tool()
def crawl_url(url: str) -> str:
    """Crawl a webpage and extract clean, ad-free Markdown text without token waste."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode('utf-8', errors='replace')
        
    html = re.sub(r'<script[\s\S]*?</script>', '', html, flags=re.I)
    html = re.sub(r'<style[\s\S]*?</style>', '', html, flags=re.I)
    text = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\n\n# \1\n', html, flags=re.I)
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\n\1\n', text, flags=re.I)
    text = re.sub(r'<li[^>]*>(.*?)</li>', r'\n* \1', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

@mcp.tool()
def extract_markdown(html_content: str) -> str:
    """Dehydrate raw HTML into clean structured Markdown text."""
    clean = re.sub(r'<script[\s\S]*?</script>', '', html_content, flags=re.I)
    clean = re.sub(r'<style[\s\S]*?</style>', '', clean, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', clean)
    return ' '.join(text.split())

@mcp.tool()
def extract_tables(url: str) -> str:
    """Extract HTML table elements from webpage and format as markdown tables."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode('utf-8', errors='replace')
    tables = re.findall(r'<table[\s\S]*?</table>', html, flags=re.I)
    if not tables:
        return "No tables found on page."
    result = []
    for idx, tbl in enumerate(tables[:5]):
        rows = re.findall(r'<tr[\s\S]*?</tr>', tbl, flags=re.I)
        tbl_out = [f"### Table {idx + 1}"]
        for r in rows:
            cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, flags=re.I)
            clean_cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            if clean_cells:
                tbl_out.append("| " + " | ".join(clean_cells) + " |")
        result.append("\n".join(tbl_out))
    return "\n\n".join(result)

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "9111"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
