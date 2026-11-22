import { describe, it, expect } from 'vitest';
import { parsePythonFile } from '../backend/src/ingest/astParserPy.js';

describe('astParserPy', () => {
  it('extracts standard imports, relative imports, and externalDeps', () => {
    const code = `
import os
import sys, json as js
from pathlib import Path
from math import (
    sin,
    cos
)

import numpy as np
import pandas as pd
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from .local_module import helper
from ..parent_pkg.sub import utility
from . import config
`;

    const result = parsePythonFile('app/main.py', code);

    // Standard imports and relative imports should all be present in imports
    expect(result.imports).toContain('os');
    expect(result.imports).toContain('sys');
    expect(result.imports).toContain('json');
    expect(result.imports).toContain('pathlib');
    expect(result.imports).toContain('math');
    expect(result.imports).toContain('numpy');
    expect(result.imports).toContain('pandas');
    expect(result.imports).toContain('fastapi');
    expect(result.imports).toContain('pydantic');
    expect(result.imports).toContain('.local_module');
    expect(result.imports).toContain('..parent_pkg.sub');
    expect(result.imports).toContain('.');

    // External dependencies should NOT contain standard library modules (os, sys, json, pathlib, math)
    expect(result.externalDeps).not.toContain('os');
    expect(result.externalDeps).not.toContain('sys');
    expect(result.externalDeps).not.toContain('json');
    expect(result.externalDeps).not.toContain('pathlib');
    expect(result.externalDeps).not.toContain('math');

    // External dependencies should NOT contain relative imports
    expect(result.externalDeps).not.toContain('.');
    expect(result.externalDeps).not.toContain('.local_module');
    expect(result.externalDeps).not.toContain('..parent_pkg.sub');

    // External dependencies MUST contain third-party packages
    expect(result.externalDeps).toContain('numpy');
    expect(result.externalDeps).toContain('pandas');
    expect(result.externalDeps).toContain('fastapi');
    expect(result.externalDeps).toContain('pydantic');
  });

  it('extracts classes, methods, functions, and async functions with 1-based line numbers', () => {
    const code = [
      'class BaseService:',
      '    def __init__(self, name: str):',
      '        self.name = name',
      '',
      '    def get_name(self) -> str:',
      '        """Return the service name."""',
      '        return self.name',
      '',
      'async def fetch_remote_data(url: str) -> dict:',
      '    # Async fetcher',
      '    return {"status": "ok"}',
      '',
      'def _private_worker():',
      '    pass',
    ].join('\n');

    const result = parsePythonFile('services.py', code);

    const classSym = result.symbols.find((s) => s.name === 'BaseService');
    expect(classSym).toBeDefined();
    expect(classSym?.kind).toBe('class');
    expect(classSym?.line).toBe(1);
    expect(classSym?.endLine).toBe(7);
    expect(classSym?.exported).toBe(true);
    expect(classSym?.signature).toBe('class BaseService:');

    const initSym = result.symbols.find((s) => s.name === '__init__');
    expect(initSym).toBeDefined();
    expect(initSym?.kind).toBe('method');
    expect(initSym?.line).toBe(2);
    expect(initSym?.endLine).toBe(3);
    expect(initSym?.exported).toBe(true);

    const getNameSym = result.symbols.find((s) => s.name === 'get_name');
    expect(getNameSym).toBeDefined();
    expect(getNameSym?.kind).toBe('method');
    expect(getNameSym?.line).toBe(5);
    expect(getNameSym?.endLine).toBe(7);
    expect(getNameSym?.exported).toBe(true);

    const asyncSym = result.symbols.find((s) => s.name === 'fetch_remote_data');
    expect(asyncSym).toBeDefined();
    expect(asyncSym?.kind).toBe('function');
    expect(asyncSym?.line).toBe(9);
    expect(asyncSym?.endLine).toBe(11);
    expect(asyncSym?.exported).toBe(true);
    expect(asyncSym?.signature).toContain('async def fetch_remote_data(url: str) -> dict:');

    const privSym = result.symbols.find((s) => s.name === '_private_worker');
    expect(privSym).toBeDefined();
    expect(privSym?.kind).toBe('function');
    expect(privSym?.exported).toBe(false);

    // Default exports when __all__ is not specified
    expect(result.exports).toContain('BaseService');
    expect(result.exports).toContain('fetch_remote_data');
    expect(result.exports).not.toContain('_private_worker');
  });

  it('extracts FastAPI and Flask route decorators accurately', () => {
    const code = [
      '@app.get("/items/{item_id}", response_model=Item)',
      'async def read_item(item_id: int):',
      '    return {"item": item_id}',
      '',
      '@router.post("/items")',
      'def create_item():',
      '    return {"ok": True}',
      '',
      '@app.route("/api/v1/users", methods=["GET", "POST"])',
      'def handle_users():',
      '    return []',
      '',
      '@bp.route("/status")',
      'def check_status():',
      '    return "healthy"',
    ].join('\n');

    const result = parsePythonFile('api.py', code);

    expect(result.routes).toContain('GET /items/{item_id}');
    expect(result.routes).toContain('POST /items');
    expect(result.routes).toContain('GET /api/v1/users');
    expect(result.routes).toContain('POST /api/v1/users');
    expect(result.routes).toContain('GET /status');

    const readItemSym = result.symbols.find((s) => s.name === 'read_item');
    expect(readItemSym).toBeDefined();
    expect(readItemSym?.kind).toBe('route');
    expect(readItemSym?.line).toBe(1);
    expect(readItemSym?.endLine).toBe(3);
    expect(readItemSym?.exported).toBe(true);

    const handleUsersSym = result.symbols.find((s) => s.name === 'handle_users');
    expect(handleUsersSym).toBeDefined();
    expect(handleUsersSym?.kind).toBe('route');
    expect(handleUsersSym?.line).toBe(9);
    expect(handleUsersSym?.endLine).toBe(11);
  });

  it('honors __all__ exports when present', () => {
    const code = [
      '__all__ = [',
      '    "PublicClass",',
      '    "public_function",',
      ']',
      '',
      'class PublicClass:',
      '    pass',
      '',
      'class UnexportedClass:',
      '    pass',
      '',
      'def public_function():',
      '    pass',
      '',
      'def unexported_function():',
      '    pass',
    ].join('\n');

    const result = parsePythonFile('module.py', code);

    expect(result.exports).toEqual(['PublicClass', 'public_function']);

    const pubClass = result.symbols.find((s) => s.name === 'PublicClass');
    expect(pubClass?.exported).toBe(true);

    const unexpClass = result.symbols.find((s) => s.name === 'UnexportedClass');
    expect(unexpClass?.exported).toBe(false);

    const pubFn = result.symbols.find((s) => s.name === 'public_function');
    expect(pubFn?.exported).toBe(true);

    const unexpFn = result.symbols.find((s) => s.name === 'unexported_function');
    expect(unexpFn?.exported).toBe(false);
  });

  it('masks triple-quoted docstrings and comments so they do not produce false symbols', () => {
    const code = [
      '"""',
      'def fake_function():',
      '    pass',
      'class FakeClass:',
      '    pass',
      '"""',
      '',
      '# def commented_function(): pass',
      '',
      'def real_function():',
      '    """Docstring containing def another_fake(): pass"""',
      '    message = "def string_fake(): pass"',
      '    return message',
    ].join('\n');

    const result = parsePythonFile('docstrings.py', code);

    expect(result.symbols.find((s) => s.name === 'fake_function')).toBeUndefined();
    expect(result.symbols.find((s) => s.name === 'FakeClass')).toBeUndefined();
    expect(result.symbols.find((s) => s.name === 'commented_function')).toBeUndefined();
    expect(result.symbols.find((s) => s.name === 'another_fake')).toBeUndefined();
    expect(result.symbols.find((s) => s.name === 'string_fake')).toBeUndefined();

    const realFn = result.symbols.find((s) => s.name === 'real_function');
    expect(realFn).toBeDefined();
    expect(realFn?.kind).toBe('function');
    expect(realFn?.line).toBe(10);
  });

  it('extracts top-level constants and multiline signatures cleanly', () => {
    const code = [
      'MAX_RETRIES = 5',
      'API_BASE_URL: str = "https://api.example.com"',
      '_SECRET_KEY = "do_not_export"',
      '',
      'def calculate_metrics(',
      '    alpha: float,',
      '    beta: float = 1.0,',
      ') -> float:',
      '    return alpha * beta',
    ].join('\n');

    const result = parsePythonFile('config.py', code);

    const maxRetries = result.symbols.find((s) => s.name === 'MAX_RETRIES');
    expect(maxRetries).toBeDefined();
    expect(maxRetries?.kind).toBe('const');
    expect(maxRetries?.exported).toBe(true);

    const apiBase = result.symbols.find((s) => s.name === 'API_BASE_URL');
    expect(apiBase).toBeDefined();
    expect(apiBase?.kind).toBe('const');
    expect(apiBase?.exported).toBe(true);

    const secret = result.symbols.find((s) => s.name === '_SECRET_KEY');
    expect(secret).toBeDefined();
    expect(secret?.kind).toBe('const');
    expect(secret?.exported).toBe(false);

    const multilineFn = result.symbols.find((s) => s.name === 'calculate_metrics');
    expect(multilineFn).toBeDefined();
    expect(multilineFn?.signature).toBe('def calculate_metrics( alpha: float, beta: float = 1.0, ) -> float:');
    expect(multilineFn?.line).toBe(5);
    expect(multilineFn?.endLine).toBe(9);
  });

  it('handles backslash import continuations and inline comments', () => {
    const code = [
      'import os, \\',
      '    sys, \\',
      '    re # standard imports',
      'from urllib.parse import \\',
      '    urlparse, \\',
      '    urljoin',
      'import httpx, \\',
      '    uvicorn',
    ].join('\n');

    const result = parsePythonFile('importer.py', code);

    expect(result.imports).toContain('os');
    expect(result.imports).toContain('sys');
    expect(result.imports).toContain('re');
    expect(result.imports).toContain('urllib.parse');
    expect(result.imports).toContain('httpx');
    expect(result.imports).toContain('uvicorn');

    // Standard library modules must not be marked as externalDeps
    expect(result.externalDeps).not.toContain('os');
    expect(result.externalDeps).not.toContain('sys');
    expect(result.externalDeps).not.toContain('re');
    expect(result.externalDeps).not.toContain('urllib');

    // Third-party packages must be marked as externalDeps
    expect(result.externalDeps).toContain('httpx');
    expect(result.externalDeps).toContain('uvicorn');
  });

  it('handles websocket routes and multiple route decorators on a single endpoint', () => {
    const code = [
      '@app.websocket("/ws/feed")',
      'async def websocket_feed(ws):',
      '    await ws.accept()',
      '',
      '@app.get("/health")',
      '@app.head("/health")',
      'def health_check():',
      '    return {"status": "ok"}',
      '',
      '@router.api_route("/resource", methods=["PUT", "DELETE"])',
      'async def mutate_resource():',
      '    pass',
      '',
      '@app.get("bare_path")',
      'def bare_endpoint():',
      '    pass',
    ].join('\n');

    const result = parsePythonFile('routes.py', code);

    expect(result.routes).toContain('WS /ws/feed');
    expect(result.routes).toContain('GET /health');
    expect(result.routes).toContain('HEAD /health');
    expect(result.routes).toContain('PUT /resource');
    expect(result.routes).toContain('DELETE /resource');
    expect(result.routes).toContain('GET /bare_path');

    const wsSym = result.symbols.find((s) => s.name === 'websocket_feed');
    expect(wsSym).toBeDefined();
    expect(wsSym?.kind).toBe('route');
    expect(wsSym?.line).toBe(1);

    const healthSym = result.symbols.find((s) => s.name === 'health_check');
    expect(healthSym).toBeDefined();
    expect(healthSym?.kind).toBe('route');
    expect(healthSym?.line).toBe(5);
  });

  it('handles tuple syntax for __all__ exports and respects it for constants', () => {
    const code = [
      '__all__ = (',
      '    "EXPORTED_CONST",',
      '    "exported_fn",',
      ')',
      '',
      'EXPORTED_CONST = 42',
      'IGNORED_CONST = 99',
      '',
      'def exported_fn():',
      '    pass',
      '',
      'def ignored_fn():',
      '    pass',
    ].join('\n');

    const result = parsePythonFile('exports.py', code);

    expect(result.exports).toEqual(['EXPORTED_CONST', 'exported_fn']);

    const expConst = result.symbols.find((s) => s.name === 'EXPORTED_CONST');
    expect(expConst?.exported).toBe(true);

    const ignConst = result.symbols.find((s) => s.name === 'IGNORED_CONST');
    expect(ignConst?.exported).toBe(false);

    const expFn = result.symbols.find((s) => s.name === 'exported_fn');
    expect(expFn?.exported).toBe(true);

    const ignFn = result.symbols.find((s) => s.name === 'ignored_fn');
    expect(ignFn?.exported).toBe(false);
  });

  it('handles nested functions and closures without exporting them', () => {
    const code = [
      'def outer_service():',
      '    def inner_helper():',
      '        return 1',
      '    return inner_helper()',
      '',
      'def second_service():',
      '    pass',
    ].join('\n');

    const result = parsePythonFile('nested.py', code);

    const outerSym = result.symbols.find((s) => s.name === 'outer_service');
    expect(outerSym).toBeDefined();
    expect(outerSym?.kind).toBe('function');
    expect(outerSym?.exported).toBe(true);

    const innerSym = result.symbols.find((s) => s.name === 'inner_helper');
    expect(innerSym).toBeDefined();
    expect(innerSym?.kind).toBe('function');
    expect(innerSym?.exported).toBe(false);

    expect(result.exports).toContain('outer_service');
    expect(result.exports).toContain('second_service');
    expect(result.exports).not.toContain('inner_helper');
  });

  it('handles class inheritance, class decorators, and async methods', () => {
    const code = [
      '@dataclass',
      'class RequestPayload(BaseModel, Validatable):',
      '    async def validate_async(self) -> bool:',
      '        return True',
      '',
      '    def sync_check(self) -> bool:',
      '        return True',
    ].join('\n');

    const result = parsePythonFile('models.py', code);

    const classSym = result.symbols.find((s) => s.name === 'RequestPayload');
    expect(classSym).toBeDefined();
    expect(classSym?.kind).toBe('class');
    expect(classSym?.line).toBe(1);
    expect(classSym?.exported).toBe(true);
    expect(classSym?.signature).toBe('@dataclass class RequestPayload(BaseModel, Validatable):');

    const asyncMethod = result.symbols.find((s) => s.name === 'validate_async');
    expect(asyncMethod).toBeDefined();
    expect(asyncMethod?.kind).toBe('method');
    expect(asyncMethod?.exported).toBe(true);

    const syncMethod = result.symbols.find((s) => s.name === 'sync_check');
    expect(syncMethod).toBeDefined();
    expect(syncMethod?.kind).toBe('method');
    expect(syncMethod?.exported).toBe(true);
  });

  it('handles empty files, whitespace-only, and comment-only files gracefully', () => {
    const emptyResult = parsePythonFile('empty.py', '');
    expect(emptyResult.imports).toEqual([]);
    expect(emptyResult.exports).toEqual([]);
    expect(emptyResult.symbols).toEqual([]);
    expect(emptyResult.routes).toEqual([]);
    expect(emptyResult.externalDeps).toEqual([]);

    const commentResult = parsePythonFile('comments.py', '# Just a comment\n# Another comment\n   \n');
    expect(commentResult.symbols).toEqual([]);
    expect(commentResult.imports).toEqual([]);
    expect(commentResult.exports).toEqual([]);
  });

  it('handles tab indentation and single-quoted triple docstrings correctly', () => {
    const code = [
      "'''",
      "def docstring_fake():",
      "\tpass",
      "'''",
      "class TabbedClass:",
      "\tdef tabbed_method(self):",
      "\t\tpass",
    ].join('\n');

    const result = parsePythonFile('tabs.py', code);

    expect(result.symbols.find((s) => s.name === 'docstring_fake')).toBeUndefined();

    const classSym = result.symbols.find((s) => s.name === 'TabbedClass');
    expect(classSym).toBeDefined();
    expect(classSym?.kind).toBe('class');

    const methodSym = result.symbols.find((s) => s.name === 'tabbed_method');
    expect(methodSym).toBeDefined();
    expect(methodSym?.kind).toBe('method');
  });
});
