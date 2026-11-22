// =============================================================================
// GitUnderstand (git-understand.com) — JS/TS AST Extractor Test Suite
// Verifies static analysis across ES imports, CommonJS, React components,
// HTTP routes, declarations, line numbers, and error resiliency.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { parseJsTsFile } from '../backend/src/ingest/astParserJs.js';
import type { ParsedCodeSignals } from '../backend/src/ingest/astParserJs.js';

describe('astParserJs (JS/TS/TSX AST Extractor)', () => {
  // ---------------------------------------------------------------------------
  // 1. ES Imports & Dependency Extraction
  // ---------------------------------------------------------------------------
  describe('ES Imports and External Dependencies', () => {
    it('extracts standard default, named, and namespace ES imports', () => {
      const code = [
        'import React, { useState, useEffect as useEff } from "react";',
        'import * as path from "node:path";',
        'import { getStatus } from "./local/status.js";',
        'import type { User } from "../types.js";',
        'import "@/styles/globals.css";',
      ].join('\n');

      const result: ParsedCodeSignals = parseJsTsFile('src/components/App.tsx', code);

      expect(result.imports).toContain('react');
      expect(result.imports).toContain('node:path');
      expect(result.imports).toContain('./local/status.js');
      expect(result.imports).toContain('../types.js');
      expect(result.imports).toContain('@/styles/globals.css');

      // External deps should isolate npm packages and node: schemes, ignoring relative/aliases
      expect(result.externalDeps).toContain('react');
      expect(result.externalDeps).toContain('node:path');
      expect(result.externalDeps).not.toContain('./local/status.js');
      expect(result.externalDeps).not.toContain('../types.js');
      expect(result.externalDeps).not.toContain('@/styles/globals.css');
    });

    it('extracts scoped npm packages correctly into externalDeps', () => {
      const code = [
        'import { createTheme } from "@mui/material/styles";',
        'import { trpc } from "@trpc/server";',
        'import { LucideIcon } from "lucide-react";',
      ].join('\n');

      const result = parseJsTsFile('src/theme.ts', code);

      expect(result.imports).toContain('@mui/material/styles');
      expect(result.imports).toContain('@trpc/server');
      expect(result.imports).toContain('lucide-react');

      expect(result.externalDeps).toContain('@mui/material');
      expect(result.externalDeps).toContain('@trpc/server');
      expect(result.externalDeps).toContain('lucide-react');
    });

    it('extracts dynamic import() calls and TS import = require()', () => {
      const code = [
        'import fs = require("node:fs");',
        'async function loadPlugins() {',
        '  const lodash = await import("lodash-es");',
        '  const localHelper = await import("./dynamicHelper.js");',
        '  return lodash;',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/loader.ts', code);

      expect(result.imports).toContain('node:fs');
      expect(result.imports).toContain('lodash-es');
      expect(result.imports).toContain('./dynamicHelper.js');

      expect(result.externalDeps).toContain('node:fs');
      expect(result.externalDeps).toContain('lodash-es');
      expect(result.externalDeps).not.toContain('./dynamicHelper.js');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CommonJS require & exports
  // ---------------------------------------------------------------------------
  describe('CommonJS require and module.exports', () => {
    it('extracts CJS require calls and external dependencies', () => {
      const code = [
        'const path = require("path");',
        'const express = require("express");',
        'const config = require("./config.json");',
        'const { helper } = require("@utils/formatting");',
      ].join('\n');

      const result = parseJsTsFile('server.cjs', code);

      expect(result.imports).toContain('path');
      expect(result.imports).toContain('express');
      expect(result.imports).toContain('./config.json');
      expect(result.imports).toContain('@utils/formatting');

      expect(result.externalDeps).toContain('path');
      expect(result.externalDeps).toContain('express');
      expect(result.externalDeps).toContain('@utils/formatting');
      expect(result.externalDeps).not.toContain('./config.json');
    });

    it('extracts module.exports properties, exports assignments, and objects', () => {
      const code = [
        'function authenticate() {}',
        'function authorize() {}',
        'exports.login = authenticate;',
        'module.exports.logout = authorize;',
        'module.exports = {',
        '  tokenKey: "SECRET",',
        '  validateToken: function() {},',
        '};',
      ].join('\n');

      const result = parseJsTsFile('auth.js', code);

      expect(result.exports).toContain('login');
      expect(result.exports).toContain('logout');
      expect(result.exports).toContain('tokenKey');
      expect(result.exports).toContain('validateToken');
    });

    it('extracts single default module.exports assignment', () => {
      const code = [
        'function mainHandler(req, res) {',
        '  res.send("ok");',
        '}',
        'module.exports = mainHandler;',
      ].join('\n');

      const result = parseJsTsFile('handler.js', code);

      expect(result.exports).toContain('default');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. React Components (JSX, TSX, React Types)
  // ---------------------------------------------------------------------------
  describe('React Components Detection', () => {
    it('identifies PascalCase function returning JSX as component', () => {
      const code = [
        'import React from "react";',
        '',
        'export function UserBadge({ name }: { name: string }) {',
        '  return <div className="badge">{name}</div>;',
        '}',
        '',
        'function InternalFooter() {',
        '  return <footer>Footer Content</footer>;',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/UserBadge.tsx', code);

      const userBadge = result.symbols.find((s) => s.name === 'UserBadge');
      expect(userBadge).toBeDefined();
      expect(userBadge?.kind).toBe('component');
      expect(userBadge?.exported).toBe(true);

      const internalFooter = result.symbols.find((s) => s.name === 'InternalFooter');
      expect(internalFooter).toBeDefined();
      expect(internalFooter?.kind).toBe('component');
      expect(internalFooter?.exported).toBe(false);
    });

    it('identifies arrow functions with React type annotations or JSX', () => {
      const code = [
        'import React from "react";',
        '',
        'export const NavigationCard: React.FC<{ title: string }> = ({ title }) => {',
        '  return (',
        '    <nav>',
        '      <h1>{title}</h1>',
        '    </nav>',
        '  );',
        '};',
        '',
        'export const CompactStatus = () => <span>Online</span>;',
      ].join('\n');

      const result = parseJsTsFile('src/NavigationCard.tsx', code);

      const navCard = result.symbols.find((s) => s.name === 'NavigationCard');
      expect(navCard).toBeDefined();
      expect(navCard?.kind).toBe('component');
      expect(navCard?.exported).toBe(true);

      const compactStatus = result.symbols.find((s) => s.name === 'CompactStatus');
      expect(compactStatus).toBeDefined();
      expect(compactStatus?.kind).toBe('component');
      expect(compactStatus?.exported).toBe(true);
    });

    it('identifies React class component with JSX in render method', () => {
      const code = [
        'import React, { Component } from "react";',
        '',
        'export class ErrorBoundary extends Component {',
        '  render() {',
        '    return <div>Something went wrong.</div>;',
        '  }',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/ErrorBoundary.jsx', code);

      const errorBoundary = result.symbols.find((s) => s.name === 'ErrorBoundary');
      expect(errorBoundary).toBeDefined();
      expect(errorBoundary?.kind).toBe('component');
      expect(errorBoundary?.exported).toBe(true);
    });

    it('distinguishes regular functions from React components', () => {
      const code = [
        'export function calculateTax(amount: number): number {',
        '  return amount * 0.15;',
        '}',
        'export const formatCurrency = (val: number) => `$${val.toFixed(2)}`;',
      ].join('\n');

      const result = parseJsTsFile('src/utils/math.ts', code);

      const calcTax = result.symbols.find((s) => s.name === 'calculateTax');
      expect(calcTax).toBeDefined();
      expect(calcTax?.kind).toBe('function');

      const formatCurr = result.symbols.find((s) => s.name === 'formatCurrency');
      expect(formatCurr).toBeDefined();
      expect(formatCurr?.kind).toBe('function');
    });

    it('detects anonymous default export component with JSX', () => {
      const code = [
        'import React from "react";',
        'export default function() {',
        '  return <main>Landing Page</main>;',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/pages/index.tsx', code);

      const defaultComp = result.symbols.find((s) => s.name === 'default');
      expect(defaultComp).toBeDefined();
      expect(defaultComp?.kind).toBe('component');
      expect(defaultComp?.exported).toBe(true);
      expect(result.exports).toContain('default');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. HTTP Routes (Next.js App/Pages Router & Express/Fastify)
  // ---------------------------------------------------------------------------
  describe('HTTP Route Detection', () => {
    it('detects Next.js App Router HTTP handlers with inferred route paths', () => {
      const code = [
        'import { NextResponse } from "next/server";',
        '',
        'export async function GET(request: Request) {',
        '  return NextResponse.json({ items: [] });',
        '}',
        '',
        'export const POST = async (request: Request) => {',
        '  return NextResponse.json({ success: true });',
        '};',
        '',
        'export async function DELETE(request: Request) {',
        '  return new Response(null, { status: 204 });',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/app/api/v2/products/route.ts', code);

      expect(result.routes).toContain('GET /api/v2/products');
      expect(result.routes).toContain('POST /api/v2/products');
      expect(result.routes).toContain('DELETE /api/v2/products');

      const getSymbol = result.symbols.find((s) => s.name === 'GET /api/v2/products');
      expect(getSymbol).toBeDefined();
      expect(getSymbol?.kind).toBe('route');
      expect(getSymbol?.exported).toBe(true);

      const postSymbol = result.symbols.find((s) => s.name === 'POST /api/v2/products');
      expect(postSymbol).toBeDefined();
      expect(postSymbol?.kind).toBe('route');
    });

    it('strips Next.js route groups like (auth) from App Router route paths', () => {
      const code = [
        'export async function GET() {',
        '  return Response.json({ user: null });',
        '}',
      ].join('\n');

      const result = parseJsTsFile('app/(dashboard)/(settings)/api/profile/route.ts', code);

      expect(result.routes).toContain('GET /api/profile');
      expect(result.routes).not.toContain('GET /(dashboard)/(settings)/api/profile');
    });

    it('detects Next.js App Router root handler', () => {
      const code = [
        'export function GET() {',
        '  return new Response("Root API OK");',
        '}',
      ].join('\n');

      const result = parseJsTsFile('app/route.ts', code);
      expect(result.routes).toContain('GET /');
    });

    it('detects Next.js Pages Router API handler', () => {
      const code = [
        'export default function handler(req, res) {',
        '  res.status(200).json({ ok: true });',
        '}',
      ].join('\n');

      const result = parseJsTsFile('pages/api/billing/[customerId].ts', code);

      expect(result.routes).toContain('ALL /api/billing/[customerId]');
      const routeSymbol = result.symbols.find((s) => s.name === 'ALL /api/billing/[customerId]');
      expect(routeSymbol?.kind).toBe('route');
      expect(routeSymbol?.exported).toBe(true);
    });

    it('detects Express router HTTP method calls', () => {
      const code = [
        'import express from "express";',
        'const router = express.Router();',
        '',
        'router.get("/health", (req, res) => res.send("healthy"));',
        'router.post("/auth/login", loginHandler);',
        'router.put("/users/:id", updateUser);',
        'router.delete("/users/:id", deleteUser);',
        'router.use("/admin", adminGuard);',
      ].join('\n');

      const result = parseJsTsFile('src/routes/api.ts', code);

      expect(result.routes).toContain('GET /health');
      expect(result.routes).toContain('POST /auth/login');
      expect(result.routes).toContain('PUT /users/:id');
      expect(result.routes).toContain('DELETE /users/:id');
      expect(result.routes).toContain('USE /admin');

      const getHealth = result.symbols.find((s) => s.name === 'GET /health');
      expect(getHealth).toBeDefined();
      expect(getHealth?.kind).toBe('route');
      expect(getHealth?.exported).toBe(false);
    });

    it('detects Fastify route definitions with single or multiple methods', () => {
      const code = [
        'fastify.route({',
        '  method: "GET",',
        '  url: "/ping",',
        '  handler: async () => "pong",',
        '});',
        '',
        'fastify.route({',
        '  method: ["POST", "PUT"],',
        '  url: "/data",',
        '  handler: saveHandler,',
        '});',
      ].join('\n');

      const result = parseJsTsFile('src/server.ts', code);

      expect(result.routes).toContain('GET /ping');
      expect(result.routes).toContain('POST /data');
      expect(result.routes).toContain('PUT /data');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Exported Functions, Classes, Types, and Re-exports
  // ---------------------------------------------------------------------------
  describe('Declarations, Classes, Types, and Re-exports', () => {
    it('extracts exported functions, classes, interfaces, types, and consts', () => {
      const code = [
        'export const MAX_CONNECTIONS = 100;',
        'const PRIVATE_SECRET = "shhh";',
        '',
        'export interface ConnectionConfig {',
        '  host: string;',
        '  port: number;',
        '}',
        '',
        'export type StatusCode = 200 | 400 | 500;',
        '',
        'export enum LogLevel {',
        '  DEBUG = "DEBUG",',
        '  INFO = "INFO",',
        '}',
        '',
        'export class ClientPool {',
        '  connect() { return true; }',
        '  disconnect() { return false; }',
        '}',
        '',
        'export function initializePool(cfg: ConnectionConfig): ClientPool {',
        '  return new ClientPool();',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/pool.ts', code);

      expect(result.exports).toContain('MAX_CONNECTIONS');
      expect(result.exports).not.toContain('PRIVATE_SECRET');
      expect(result.exports).toContain('ConnectionConfig');
      expect(result.exports).toContain('StatusCode');
      expect(result.exports).toContain('LogLevel');
      expect(result.exports).toContain('ClientPool');
      expect(result.exports).toContain('initializePool');

      // Verify symbols
      const symbolsByName = new Map(result.symbols.map((s) => [s.name, s]));

      expect(symbolsByName.get('MAX_CONNECTIONS')?.kind).toBe('const');
      expect(symbolsByName.get('MAX_CONNECTIONS')?.exported).toBe(true);

      expect(symbolsByName.get('PRIVATE_SECRET')?.kind).toBe('const');
      expect(symbolsByName.get('PRIVATE_SECRET')?.exported).toBe(false);

      expect(symbolsByName.get('ConnectionConfig')?.kind).toBe('interface');
      expect(symbolsByName.get('ConnectionConfig')?.exported).toBe(true);

      expect(symbolsByName.get('StatusCode')?.kind).toBe('type');
      expect(symbolsByName.get('StatusCode')?.exported).toBe(true);

      expect(symbolsByName.get('LogLevel')?.kind).toBe('type');
      expect(symbolsByName.get('LogLevel')?.exported).toBe(true);

      expect(symbolsByName.get('ClientPool')?.kind).toBe('class');
      expect(symbolsByName.get('ClientPool.connect')?.kind).toBe('method');
      expect(symbolsByName.get('ClientPool.disconnect')?.kind).toBe('method');

      expect(symbolsByName.get('initializePool')?.kind).toBe('function');
      expect(symbolsByName.get('initializePool')?.exported).toBe(true);
    });

    it('correctly handles named re-exports and aliasing', () => {
      const code = [
        'function localA() {}',
        'function localB() {}',
        'const localC = 42;',
        '',
        'export { localA, localB as publicB, localC };',
        'export * from "./externalUtils.js";',
        'export { default as SharedEngine } from "./engine.js";',
      ].join('\n');

      const result = parseJsTsFile('src/index.ts', code);

      expect(result.exports).toContain('localA');
      expect(result.exports).toContain('publicB');
      expect(result.exports).toContain('localC');
      expect(result.exports).toContain('*');
      expect(result.exports).toContain('SharedEngine');

      expect(result.imports).toContain('./externalUtils.js');
      expect(result.imports).toContain('./engine.js');

      // Check that localA and localC were marked as exported through the re-export clause
      const symA = result.symbols.find((s) => s.name === 'localA');
      expect(symA?.exported).toBe(true);

      const symC = result.symbols.find((s) => s.name === 'localC');
      expect(symC?.exported).toBe(true);
    });

    it('handles export default with identifier', () => {
      const code = [
        'function databaseDriver() {',
        '  return { connected: true };',
        '}',
        'export default databaseDriver;',
      ].join('\n');

      const result = parseJsTsFile('src/driver.ts', code);

      expect(result.exports).toContain('default');
      expect(result.exports).toContain('databaseDriver');

      const driverSym = result.symbols.find((s) => s.name === 'databaseDriver');
      expect(driverSym?.exported).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Line Numbers and Signatures
  // ---------------------------------------------------------------------------
  describe('Accurate Line Numbers and Signatures', () => {
    it('accurately reports 1-based start line and endLine for symbols', () => {
      const code = [
        '// Line 1: Header comment',
        '// Line 2: Secondary comment',
        'export const VERSION = "2.4.0";', // Line 3
        '',                                 // Line 4
        'export function calculateArea(',  // Line 5
        '  width: number,',                // Line 6
        '  height: number',                // Line 7
        '): number {',                     // Line 8
        '  return width * height;',        // Line 9
        '}',                               // Line 10
        '',                                // Line 11
        'export class Rectangle {',        // Line 12
        '  getPerimeter(',                 // Line 13
        '    w: number,',                  // Line 14
        '    h: number',                   // Line 15
        '  ) {',                           // Line 16
        '    return 2 * (w + h);',         // Line 17
        '  }',                             // Line 18
        '}',                               // Line 19
      ].join('\n');

      const result = parseJsTsFile('src/geometry.ts', code);

      const versionSym = result.symbols.find((s) => s.name === 'VERSION');
      expect(versionSym).toBeDefined();
      expect(versionSym?.line).toBe(3);
      expect(versionSym?.endLine).toBe(3);

      const calcAreaSym = result.symbols.find((s) => s.name === 'calculateArea');
      expect(calcAreaSym).toBeDefined();
      expect(calcAreaSym?.line).toBe(5);
      expect(calcAreaSym?.endLine).toBe(10);
      expect(calcAreaSym?.signature).toContain('calculateArea');

      const rectSym = result.symbols.find((s) => s.name === 'Rectangle');
      expect(rectSym).toBeDefined();
      expect(rectSym?.line).toBe(12);
      expect(rectSym?.endLine).toBe(19);

      const perimeterMethod = result.symbols.find((s) => s.name === 'Rectangle.getPerimeter');
      expect(perimeterMethod).toBeDefined();
      expect(perimeterMethod?.line).toBe(13);
      expect(perimeterMethod?.endLine).toBe(18);

      // Verify symbols are sorted strictly ascending by line number
      for (let i = 1; i < result.symbols.length; i++) {
        expect(result.symbols[i].line).toBeGreaterThanOrEqual(result.symbols[i - 1].line);
      }
    });

    it('extracts concise signature strings without multi-line sprawl', () => {
      const code = [
        'export function executeBatch<T>(',
        '  items: T[],',
        '  batchSize: number',
        '): Promise<void> {',
        '  return Promise.resolve();',
        '}',
      ].join('\n');

      const result = parseJsTsFile('src/batch.ts', code);
      const batchSym = result.symbols.find((s) => s.name === 'executeBatch');

      expect(batchSym).toBeDefined();
      expect(batchSym?.signature).toBe('export function executeBatch<T>( items: T[], batchSize: number ): Promise<void>');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Edge Cases, Extensions, & Resiliency
  // ---------------------------------------------------------------------------
  describe('Edge Cases and Resiliency', () => {
    it('returns empty collections for empty or whitespace content', () => {
      const emptyResult = parseJsTsFile('empty.ts', '');
      expect(emptyResult.imports).toEqual([]);
      expect(emptyResult.exports).toEqual([]);
      expect(emptyResult.symbols).toEqual([]);
      expect(emptyResult.routes).toEqual([]);
      expect(emptyResult.externalDeps).toEqual([]);

      const whitespaceResult = parseJsTsFile('space.js', '   \n\t  \n   ');
      expect(whitespaceResult.imports).toEqual([]);
      expect(whitespaceResult.exports).toEqual([]);
      expect(whitespaceResult.symbols).toEqual([]);
      expect(whitespaceResult.routes).toEqual([]);
      expect(whitespaceResult.externalDeps).toEqual([]);
    });

    it('handles syntax errors gracefully without throwing', () => {
      const brokenCode = [
        'export function unfinished(',
        'const = @@@@ broken syntax',
        'export const valid = 123;',
      ].join('\n');

      expect(() => {
        const result = parseJsTsFile('broken.ts', brokenCode);
        expect(result).toBeDefined();
        expect(result.exports).toContain('valid');
      }).not.toThrow();
    });

    it('correctly adapts script kind for .mjs, .cjs, .jsx, and .tsx extensions', () => {
      const mjsCode = 'export const format = () => "mjs";';
      const mjsResult = parseJsTsFile('file.mjs', mjsCode);
      expect(mjsResult.exports).toContain('format');

      const cjsCode = 'module.exports = { isCjs: true };';
      const cjsResult = parseJsTsFile('file.cjs', cjsCode);
      expect(cjsResult.exports).toContain('isCjs');

      const jsxCode = 'export const Tag = () => <span />;'
      const jsxResult = parseJsTsFile('file.jsx', jsxCode);
      expect(jsxResult.symbols[0]?.kind).toBe('component');

      const tsxCode = 'export const View = (): JSX.Element => <div>TSX</div>;';
      const tsxResult = parseJsTsFile('file.tsx', tsxCode);
      expect(tsxResult.symbols[0]?.kind).toBe('component');
    });

    it('extracts template literals and regex route patterns safely', () => {
      const code = [
        'app.get(`/api/items/${itemId}`, (req, res) => {});',
        'app.post(/\\/api\\/v1\\/regex/, handler);',
      ].join('\n');

      const result = parseJsTsFile('server.js', code);
      expect(result.routes.length).toBe(2);
      expect(result.routes[0]).toContain('GET /api/items/');
      expect(result.routes[1]).toContain('POST');
    });
  });
});
