"""
Nexus Cloudflare & Network Observability MCP Server
Provides standard MCP tools for DNS resolution, SSL certificate inspection, HTTP latency probing, and header diagnostics.
"""
import sys
import os
import json
import ssl
import socket
import time
import urllib.request
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Cloudflare-Observability")

@mcp.tool()
def resolve_dns_records(domain: str, record_type: str = "A") -> str:
    """Resolve DNS records using Cloudflare 1.1.1.1 DNS-over-HTTPS (DoH)."""
    clean_domain = domain.replace("http://", "").replace("https://", "").split("/")[0]
    url = f"https://cloudflare-dns.com/dns-query?name={clean_domain}&type={record_type}"
    req = urllib.request.Request(url, headers={"Accept": "application/dns-json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        answers = data.get("Answer", [])
        return json.dumps({
            "domain": clean_domain,
            "type": record_type,
            "status": data.get("Status", 0),
            "records": answers
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"domain": clean_domain, "error": str(e)}, ensure_ascii=False)

@mcp.tool()
def verify_ssl_certificate(domain: str, port: int = 443) -> str:
    """Connect to host via TLS and inspect SSL/TLS certificate validity, issuer, and expiration date."""
    clean_host = domain.replace("http://", "").replace("https://", "").split("/")[0]
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((clean_host, port), timeout=8) as sock:
            with ctx.wrap_socket(sock, server_hostname=clean_host) as ssock:
                cert = ssock.getpeercert()
        return json.dumps({
            "host": clean_host,
            "port": port,
            "valid": True,
            "subject": cert.get("subject", []),
            "issuer": cert.get("issuer", []),
            "notBefore": cert.get("notBefore", ""),
            "notAfter": cert.get("notAfter", ""),
            "version": ssock.version()
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"host": clean_host, "valid": False, "error": str(e)}, ensure_ascii=False)

@mcp.tool()
def probe_http_latency(url: str) -> str:
    """Probe an HTTP/HTTPS endpoint and measure DNS/Handshake latency and response status."""
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    t0 = time.perf_hooks_time() if hasattr(time, 'perf_hooks_time') else time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "NexusObservability/1.3"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            t1 = time.perf_hooks_time() if hasattr(time, 'perf_hooks_time') else time.time()
            latency_ms = round((t1 - t0) * 1000, 2)
            return json.dumps({
                "url": url,
                "status": resp.status,
                "latency_ms": latency_ms,
                "server": resp.headers.get("Server", "Unknown")
            }, ensure_ascii=False, indent=2)
    except Exception as e:
        t1 = time.perf_hooks_time() if hasattr(time, 'perf_hooks_time') else time.time()
        return json.dumps({
            "url": url,
            "latency_ms": round((t1 - t0) * 1000, 2),
            "error": str(e)
        }, ensure_ascii=False)

@mcp.tool()
def inspect_security_headers(url: str) -> str:
    """Inspect critical web security headers: Strict-Transport-Security, Content-Security-Policy, etc."""
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "NexusObservability/1.3"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            h = resp.headers
        sec_headers = {
            "Strict-Transport-Security (HSTS)": h.get("Strict-Transport-Security", "Missing"),
            "Content-Security-Policy (CSP)": h.get("Content-Security-Policy", "Missing"),
            "X-Frame-Options": h.get("X-Frame-Options", "Missing"),
            "X-Content-Type-Options": h.get("X-Content-Type-Options", "Missing"),
            "Referrer-Policy": h.get("Referrer-Policy", "Missing")
        }
        return json.dumps({"url": url, "security_headers": sec_headers}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"url": url, "error": str(e)}, ensure_ascii=False)

@mcp.tool()
def whois_lookup(domain: str) -> str:
    """Perform RDAP / WHOIS lookup for domain registration information."""
    clean_domain = domain.replace("http://", "").replace("https://", "").split("/")[0]
    url = f"https://rdap.org/domain/{clean_domain}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return json.dumps({
            "domain": clean_domain,
            "handle": data.get("handle", ""),
            "status": data.get("status", []),
            "nameservers": [ns.get("ldhName", "") for ns in data.get("nameservers", [])]
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"domain": clean_domain, "error": str(e)}, ensure_ascii=False)

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "9109"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
