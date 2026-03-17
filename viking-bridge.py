#!/usr/bin/env python3
"""
PulseOS ↔ OpenViking Bridge Server

Starts OpenViking's HTTP server and adds PulseOS-specific endpoints:
- Syncs Viking resources/memories with PulseOS app data JSON files
- Provides a REST API that Node.js server.js can proxy to
- Auto-imports existing PulseOS app data as Viking resources

Usage: python3 viking-bridge.py
Runs on port 1933 (Viking default) + bridge on port 1934
"""

import asyncio
import json
import os
import sys
import signal
import time
from pathlib import Path
from typing import Optional

# OpenViking imports
try:
    import openviking as ov
    from openviking.server.app import create_app
except ImportError:
    print("ERROR: openviking not installed. Run: pip install openviking")
    sys.exit(1)

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Config ──
PULSEOS_ROOT = Path(__file__).parent
VIKING_DATA = PULSEOS_ROOT / "data" / "viking"
APPS_DIR = PULSEOS_ROOT / "apps"
BRIDGE_PORT = 1934
VIKING_PORT = 1933

# ── State ──
viking_client: Optional[ov.OpenViking] = None

# ── Bridge App ──
bridge = FastAPI(title="PulseOS Viking Bridge")
bridge.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_client():
    """Get or create Viking client."""
    global viking_client
    if viking_client is None:
        viking_client = ov.OpenViking(path=str(VIKING_DATA))
        viking_client.initialize()
    return viking_client


@bridge.get("/api/viking/status")
async def viking_status():
    """Check Viking health and stats."""
    try:
        client = get_client()
        # List top-level scopes
        resources = client.ls("viking://resources/")
        memories = client.ls("viking://user/")
        agents = client.ls("viking://agent/")
        return {
            "ok": True,
            "version": ov.__version__,
            "dataPath": str(VIKING_DATA),
            "scopes": {
                "resources": len(resources) if resources else 0,
                "user": len(memories) if memories else 0,
                "agent": len(agents) if agents else 0,
            }
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.get("/api/viking/ls")
async def viking_ls(uri: str = "viking://resources/"):
    """List contents at a Viking URI."""
    try:
        client = get_client()
        result = client.ls(uri)
        items = []
        if result:
            for item in result:
                if isinstance(item, dict):
                    entry = {
                        "name": item.get("name", ""),
                        "uri": item.get("uri", ""),
                        "type": "dir" if item.get("isDir") else "file",
                        "size": item.get("size", 0),
                    }
                else:
                    entry = {
                        "name": getattr(item, "name", str(item)),
                        "uri": getattr(item, "uri", ""),
                        "type": getattr(item, "type", "unknown"),
                    }
                items.append(entry)
        return {"ok": True, "uri": uri, "items": items}
    except Exception as e:
        return {"ok": False, "error": str(e), "items": []}


@bridge.get("/api/viking/read")
async def viking_read(uri: str):
    """Read content at a Viking URI (L2 - full detail)."""
    try:
        client = get_client()
        content = client.read(uri)
        return {"ok": True, "uri": uri, "content": str(content) if content else ""}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.get("/api/viking/abstract")
async def viking_abstract(uri: str):
    """Get L0 abstract (~100 tokens)."""
    try:
        client = get_client()
        abstract = client.abstract(uri)
        return {"ok": True, "uri": uri, "abstract": str(abstract) if abstract else ""}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.get("/api/viking/overview")
async def viking_overview(uri: str):
    """Get L1 overview (~1000-2000 tokens)."""
    try:
        client = get_client()
        overview = client.overview(uri)
        return {"ok": True, "uri": uri, "overview": str(overview) if overview else ""}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.post("/api/viking/search")
async def viking_search(request: Request):
    """Semantic search across Viking data."""
    try:
        body = await request.json()
        query = body.get("query", "")
        target_uri = body.get("target_uri", "viking://resources/")
        limit = body.get("limit", 5)

        client = get_client()
        results = client.find(query, target_uri=target_uri, limit=limit)

        items = []
        if results:
            result_list = results.resources if hasattr(results, "resources") else (results if isinstance(results, list) else [])
            for r in result_list:
                if isinstance(r, dict):
                    items.append({
                        "uri": r.get("uri", ""),
                        "score": r.get("score", 0),
                        "name": r.get("name", ""),
                        "abstract": r.get("abstract", ""),
                    })
                else:
                    items.append({
                        "uri": getattr(r, "uri", ""),
                        "score": getattr(r, "score", 0),
                        "name": getattr(r, "name", ""),
                        "abstract": getattr(r, "abstract", ""),
                    })
        return {"ok": True, "query": query, "results": items}
    except Exception as e:
        return {"ok": False, "error": str(e), "results": []}


@bridge.post("/api/viking/add-resource")
async def viking_add_resource(request: Request):
    """Add a resource to Viking."""
    try:
        body = await request.json()
        path_or_url = body.get("path", "")
        target_uri = body.get("target_uri", "viking://resources/")

        client = get_client()
        result = client.add_resource(path=path_or_url, target_uri=target_uri)
        return {"ok": True, "result": str(result) if result else "added"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.post("/api/viking/write")
async def viking_write(request: Request):
    """Write/update content at a Viking URI."""
    try:
        body = await request.json()
        uri = body.get("uri", "")
        content = body.get("content", "")

        client = get_client()
        # Use the client's write method
        if hasattr(client, "write"):
            client.write(uri, content)
        else:
            # Fallback: write via the filesystem service
            client._client._service.fs_service.write(uri, content)
        return {"ok": True, "uri": uri}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.post("/api/viking/import-app")
async def viking_import_app(request: Request):
    """Import a PulseOS app's data into Viking as a resource."""
    try:
        body = await request.json()
        app_id = body.get("appId", "")
        if not app_id:
            return {"ok": False, "error": "appId required"}

        app_dir = APPS_DIR / app_id
        data_dir = app_dir / "data"

        if not data_dir.exists():
            return {"ok": False, "error": f"No data directory for app '{app_id}'"}

        client = get_client()
        imported = []

        # Import each JSON file in the app's data directory
        for json_file in data_dir.glob("*.json"):
            if json_file.name.startswith("_"):
                continue  # Skip internal files

            target = f"viking://resources/pulseos/{app_id}/"
            try:
                client.add_resource(path=str(json_file), target_uri=target)
                imported.append(json_file.name)
            except Exception as e:
                imported.append(f"{json_file.name} (error: {e})")

        # Also import app.json metadata if present
        app_json = app_dir / "app.json"
        if app_json.exists():
            try:
                client.add_resource(
                    path=str(app_json),
                    target_uri=f"viking://resources/pulseos/{app_id}/"
                )
                imported.append("app.json")
            except Exception as e:
                imported.append(f"app.json (error: {e})")

        return {"ok": True, "appId": app_id, "imported": imported}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@bridge.post("/api/viking/import-all-apps")
async def viking_import_all_apps():
    """Import all PulseOS apps that have data directories."""
    results = {}
    for app_dir in sorted(APPS_DIR.iterdir()):
        if not app_dir.is_dir():
            continue
        data_dir = app_dir / "data"
        if not data_dir.exists():
            continue
        app_id = app_dir.name
        # Count importable files
        json_files = [f for f in data_dir.glob("*.json") if not f.name.startswith("_")]
        if json_files:
            try:
                client = get_client()
                imported = []
                for json_file in json_files:
                    target = f"viking://resources/pulseos/{app_id}/"
                    client.add_resource(path=str(json_file), target_uri=target)
                    imported.append(json_file.name)
                results[app_id] = {"ok": True, "files": imported}
            except Exception as e:
                results[app_id] = {"ok": False, "error": str(e)}

    return {"ok": True, "apps": results}


@bridge.get("/api/viking/app-context/{app_id}")
async def viking_app_context(app_id: str):
    """Get Viking context for a specific PulseOS app.
    Returns L1 overviews of all resources related to this app."""
    try:
        client = get_client()
        uri = f"viking://resources/pulseos/{app_id}/"
        items = client.ls(uri)

        context = []
        if items:
            for item in items:
                item_uri = item.get("uri", "") if isinstance(item, dict) else getattr(item, "uri", "")
                item_name = item.get("name", "") if isinstance(item, dict) else getattr(item, "name", "")
                if item_uri:
                    try:
                        overview = client.overview(item_uri)
                        context.append({
                            "name": item_name,
                            "uri": item_uri,
                            "overview": str(overview) if overview else "",
                        })
                    except Exception:
                        context.append({
                            "name": item_name,
                            "uri": item_uri,
                            "overview": "(could not load)",
                        })

        return {"ok": True, "appId": app_id, "context": context}
    except Exception as e:
        return {"ok": False, "error": str(e), "context": []}


@bridge.get("/api/viking/tree")
async def viking_tree():
    """Get full Viking filesystem tree for the UI."""
    try:
        client = get_client()
        tree = {}
        scopes = [
            ("resources", "viking://resources/"),
            ("user", "viking://user/"),
            ("agent", "viking://agent/"),
        ]
        for scope_name, scope_uri in scopes:
            items = client.ls(scope_uri)
            tree[scope_name] = []
            if items:
                for item in items:
                    if isinstance(item, dict):
                        entry = {
                            "name": item.get("name", ""),
                            "uri": item.get("uri", ""),
                            "type": "dir" if item.get("isDir") else "file",
                            "size": item.get("size", 0),
                        }
                    else:
                        entry = {
                            "name": getattr(item, "name", str(item)),
                            "uri": getattr(item, "uri", ""),
                            "type": getattr(item, "type", "unknown"),
                        }
                    tree[scope_name].append(entry)
        return {"ok": True, "tree": tree}
    except Exception as e:
        return {"ok": False, "error": str(e), "tree": {}}


def main():
    """Start the bridge server."""
    print(f"🏴 PulseOS Viking Bridge starting on port {BRIDGE_PORT}")
    print(f"📂 Viking data: {VIKING_DATA}")
    print(f"📱 PulseOS apps: {APPS_DIR}")

    # Initialize Viking on startup
    try:
        get_client()
        print(f"✅ OpenViking {ov.__version__} initialized")
    except Exception as e:
        print(f"⚠️  OpenViking init warning: {e}")

    uvicorn.run(
        bridge,
        host="0.0.0.0",
        port=BRIDGE_PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
