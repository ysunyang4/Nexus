"""
Nexus Crawl4ai Fast Web Extractor MCP Server
Provides standard MCP tools for fast webpage crawling, markdown dehydration, and structured text extraction.
"""
import sys
import json
import re
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Crawl4ai-Dehydrator")

@mcp.tool()
def crawl_url(url: str) -> str:
    """Crawl a webpage and extract clean, ad-free Markdown text without token waste."""
    import urllib.request
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

if __name__ == "__main__":
    mcp.run()
