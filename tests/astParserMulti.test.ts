// =============================================================================
// GitUnderstand (git-understand.com) — Multi-Language AST Extractor Tests
// Tests for Go, Rust, SQL, Dockerfile, and universal extractFileSignals dispatcher
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseMultiLangFile,
  extractFileSignals,
  normalizeLanguage,
  type ExtractedFileSignals,
} from '../backend/src/ingest/astParserMulti.js';

describe('normalizeLanguage', () => {
  it('identifies exact manifest basenames regardless of path', () => {
    expect(normalizeLanguage('/repo/package.json', '')).toBe('manifest:package.json');
    expect(normalizeLanguage('backend/pyproject.toml', '')).toBe('manifest:pyproject.toml');
    expect(normalizeLanguage('crates/core/Cargo.toml', '')).toBe('manifest:cargo.toml');
    expect(normalizeLanguage('/root/go.mod', '')).toBe('manifest:go.mod');
    expect(normalizeLanguage('Dockerfile', '')).toBe('dockerfile');
    expect(normalizeLanguage('dockerfile.production', '')).toBe('dockerfile');
    expect(normalizeLanguage('Containerfile', '')).toBe('dockerfile');
    expect(normalizeLanguage('app.dockerfile', '')).toBe('dockerfile');
  });

  it('normalizes common language alias strings', () => {
    expect(normalizeLanguage('file', 'golang')).toBe('go');
    expect(normalizeLanguage('file', 'go')).toBe('go');
    expect(normalizeLanguage('file', 'rs')).toBe('rust');
    expect(normalizeLanguage('file', 'rust')).toBe('rust');
    expect(normalizeLanguage('file', 'sql')).toBe('sql');
    expect(normalizeLanguage('file', 'docker')).toBe('dockerfile');
    expect(normalizeLanguage('file', 'dockerfile')).toBe('dockerfile');
    expect(normalizeLanguage('file', 'py')).toBe('python');
    expect(normalizeLanguage('file', 'python')).toBe('python');
    expect(normalizeLanguage('file', 'ts')).toBe('typescript');
    expect(normalizeLanguage('file', 'tsx')).toBe('typescript');
    expect(normalizeLanguage('file', 'js')).toBe('javascript');
    expect(normalizeLanguage('file', 'cpp')).toBe('cpp');
    expect(normalizeLanguage('file', 'c++')).toBe('cpp');
  });

  it('infers language from file extension when language string is empty', () => {
    expect(normalizeLanguage('server/main.go', '')).toBe('go');
    expect(normalizeLanguage('src/lib.rs', '')).toBe('rust');
    expect(normalizeLanguage('db/migrations/001.sql', '')).toBe('sql');
    expect(normalizeLanguage('service/Worker.java', '')).toBe('java');
    expect(normalizeLanguage('app/Main.kt', '')).toBe('kotlin');
    expect(normalizeLanguage('native/engine.cpp', '')).toBe('cpp');
    expect(normalizeLanguage('native/header.h', '')).toBe('c');
    expect(normalizeLanguage('schema.graphql', '')).toBe('graphql');
    expect(normalizeLanguage('config.yaml', '')).toBe('yaml');
    expect(normalizeLanguage('data.json', '')).toBe('json');
    expect(normalizeLanguage('file.unknown', '')).toBe('unknown');
  });
});

describe('parseMultiLangFile - Go (.go)', () => {
  it('extracts package declarations, single and grouped imports, and external dependencies', () => {
    const code = `
package service

import "fmt"
import netHttp "net/http"

import (
    "context"
    "time"
    "github.com/gin-gonic/gin"
    "github.com/gin-gonic/gin/binding"
    "google.golang.org/grpc"
    "./localpkg"
)
`;

    const signals: ExtractedFileSignals = parseMultiLangFile('service/server.go', 'go', code);

    // Package symbol & export
    expect(signals.exports).toContain('service');
    const pkgSym = signals.symbols.find((s) => s.name === 'service');
    expect(pkgSym).toBeDefined();
    expect(pkgSym?.kind).toBe('module');
    expect(pkgSym?.exported).toBe(true);

    // Imports
    expect(signals.imports).toContain('fmt');
    expect(signals.imports).toContain('net/http');
    expect(signals.imports).toContain('context');
    expect(signals.imports).toContain('time');
    expect(signals.imports).toContain('github.com/gin-gonic/gin');
    expect(signals.imports).toContain('github.com/gin-gonic/gin/binding');
    expect(signals.imports).toContain('google.golang.org/grpc');
    expect(signals.imports).toContain('./localpkg');

    // External dependencies (domain-based module paths, truncated to owner/repo when applicable)
    expect(signals.externalDeps).toContain('github.com/gin-gonic/gin');
    expect(signals.externalDeps).toContain('google.golang.org/grpc');
    expect(signals.externalDeps).not.toContain('fmt');
    expect(signals.externalDeps).not.toContain('context');
    expect(signals.externalDeps).not.toContain('./localpkg');
  });

  it('extracts exported and unexported functions, methods with receivers, structs, interfaces, and types', () => {
    const code = [
      'package api',
      '',
      'type User struct {',
      '    ID   string',
      '    Name string',
      '}',
      '',
      'type AuthProvider interface {',
      '    Authenticate(token string) bool',
      '}',
      '',
      'type UserID string',
      '',
      'type internalCache struct {',
      '    data map[string]string',
      '}',
      '',
      'const MaxRetries = 5',
      'var defaultTimeout = 30',
      '',
      'func NewUser(name string) *User {',
      '    return &User{Name: name}',
      '}',
      '',
      'func internalHelper() string {',
      '    return "secret"',
      '}',
      '',
      'func (u *User) GetDisplayName() string {',
      '    return u.Name',
      '}',
      '',
      'func (u *User) sanitize() {',
      '    u.Name = ""',
      '}',
    ].join('\n');

    const signals = parseMultiLangFile('api/user.go', 'go', code);

    // Structs and interfaces
    const userSym = signals.symbols.find((s) => s.name === 'User');
    expect(userSym).toBeDefined();
    expect(userSym?.kind).toBe('class');
    expect(userSym?.exported).toBe(true);
    expect(signals.exports).toContain('User');

    const authSym = signals.symbols.find((s) => s.name === 'AuthProvider');
    expect(authSym).toBeDefined();
    expect(authSym?.kind).toBe('interface');
    expect(authSym?.exported).toBe(true);
    expect(signals.exports).toContain('AuthProvider');

    const typeAliasSym = signals.symbols.find((s) => s.name === 'UserID');
    expect(typeAliasSym).toBeDefined();
    expect(typeAliasSym?.kind).toBe('type');
    expect(typeAliasSym?.exported).toBe(true);

    const privateStruct = signals.symbols.find((s) => s.name === 'internalCache');
    expect(privateStruct).toBeDefined();
    expect(privateStruct?.kind).toBe('class');
    expect(privateStruct?.exported).toBe(false);
    expect(signals.exports).not.toContain('internalCache');

    // Constants & Variables
    const constSym = signals.symbols.find((s) => s.name === 'MaxRetries');
    expect(constSym).toBeDefined();
    expect(constSym?.kind).toBe('const');
    expect(constSym?.exported).toBe(true);

    const varSym = signals.symbols.find((s) => s.name === 'defaultTimeout');
    expect(varSym).toBeDefined();
    expect(varSym?.kind).toBe('const');
    expect(varSym?.exported).toBe(false);

    // Functions
    const newFn = signals.symbols.find((s) => s.name === 'NewUser');
    expect(newFn).toBeDefined();
    expect(newFn?.kind).toBe('function');
    expect(newFn?.exported).toBe(true);
    expect(signals.exports).toContain('NewUser');

    const privateFn = signals.symbols.find((s) => s.name === 'internalHelper');
    expect(privateFn).toBeDefined();
    expect(privateFn?.kind).toBe('function');
    expect(privateFn?.exported).toBe(false);
    expect(signals.exports).not.toContain('internalHelper');

    // Methods
    const methodExp = signals.symbols.find((s) => s.name === 'User.GetDisplayName');
    expect(methodExp).toBeDefined();
    expect(methodExp?.kind).toBe('method');
    expect(methodExp?.exported).toBe(true);
    expect(signals.exports).toContain('User.GetDisplayName');

    const methodPriv = signals.symbols.find((s) => s.name === 'User.sanitize');
    expect(methodPriv).toBeDefined();
    expect(methodPriv?.kind).toBe('method');
    expect(methodPriv?.exported).toBe(false);
    expect(signals.exports).not.toContain('User.sanitize');
  });

  it('extracts common Go HTTP router endpoints (Gin, Chi, Echo, net/http)', () => {
    const code = `
package routes

import "net/http"

func Register(r *gin.Engine) {
    r.GET("/api/v1/users", listUsers)
    r.POST("/api/v1/users", createUser)
    router.PUT("/api/v1/users/:id", updateUser)
    app.DELETE("/api/v1/users/:id", deleteUser)
    v1.PATCH("/api/v1/users/:id/role", patchUser)
    mux.HandleFunc("/rpc/status", statusHandler)
    http.HandleFunc("/healthz", healthzHandler)
}
`;

    const signals = parseMultiLangFile('routes/routes.go', 'go', code);

    expect(signals.routes).toContain('GET /api/v1/users');
    expect(signals.routes).toContain('POST /api/v1/users');
    expect(signals.routes).toContain('PUT /api/v1/users/:id');
    expect(signals.routes).toContain('DELETE /api/v1/users/:id');
    expect(signals.routes).toContain('PATCH /api/v1/users/:id/role');
    expect(signals.routes).toContain('/rpc/status');
    expect(signals.routes).toContain('/healthz');

    const routeSym = signals.symbols.find((s) => s.name === 'GET /api/v1/users');
    expect(routeSym).toBeDefined();
    expect(routeSym?.kind).toBe('route');
    expect(routeSym?.exported).toBe(true);
  });
});

describe('parseMultiLangFile - Rust (.rs)', () => {
  it('extracts modules, use statements, extern crates, and external crate dependencies', () => {
    const code = `
pub mod auth;
mod internal;

use std::collections::HashMap;
use core::fmt::Debug;
use tokio::net::TcpListener;
use serde::{Serialize, Deserialize};
use crate::models::User;
pub use crate::auth::Authenticator;
extern crate libc;
`;

    const signals = parseMultiLangFile('src/lib.rs', 'rust', code);

    // Modules
    const pubMod = signals.symbols.find((s) => s.name === 'auth');
    expect(pubMod).toBeDefined();
    expect(pubMod?.kind).toBe('module');
    expect(pubMod?.exported).toBe(true);
    expect(signals.exports).toContain('auth');

    const privMod = signals.symbols.find((s) => s.name === 'internal');
    expect(privMod).toBeDefined();
    expect(privMod?.kind).toBe('module');
    expect(privMod?.exported).toBe(false);

    // Imports
    expect(signals.imports).toContain('std::collections::HashMap');
    expect(signals.imports).toContain('tokio::net::TcpListener');
    expect(signals.imports).toContain('serde::{Serialize, Deserialize}');
    expect(signals.imports).toContain('libc');

    // External dependencies (excluding std, core, crate, super, self)
    expect(signals.externalDeps).toContain('tokio');
    expect(signals.externalDeps).toContain('serde');
    expect(signals.externalDeps).toContain('libc');
    expect(signals.externalDeps).not.toContain('std');
    expect(signals.externalDeps).not.toContain('core');
    expect(signals.externalDeps).not.toContain('crate');

    // Re-exports
    expect(signals.exports).toContain('Authenticator');
  });

  it('extracts structs, enums, traits, type aliases, consts, impl blocks, and functions', () => {
    const code = [
      'pub struct ServerConfig {',
      '    pub port: u16,',
      '}',
      '',
      'struct PrivateState {',
      '    count: u64,',
      '}',
      '',
      'pub enum AppError {',
      '    NotFound,',
      '    Unauthorized,',
      '}',
      '',
      'pub trait Repository {',
      '    fn find_by_id(&self, id: u64) -> Option<String>;',
      '}',
      '',
      'pub type AppResult<T> = Result<T, AppError>;',
      '',
      'pub const MAX_WORKERS: usize = 16;',
      'const TIMEOUT_SEC: u64 = 60;',
      '',
      'pub async fn start_server(cfg: ServerConfig) -> AppResult<()> {',
      '    Ok(())',
      '}',
      '',
      'fn internal_worker() {',
      '}',
      '',
      'impl Repository for ServerConfig {',
      '}',
      '',
      'impl ServerConfig {',
      '}',
    ].join('\n');

    const signals = parseMultiLangFile('src/server.rs', 'rust', code);

    // Structs
    const structSym = signals.symbols.find((s) => s.name === 'ServerConfig');
    expect(structSym).toBeDefined();
    expect(structSym?.kind).toBe('class');
    expect(structSym?.exported).toBe(true);
    expect(signals.exports).toContain('ServerConfig');

    const privStruct = signals.symbols.find((s) => s.name === 'PrivateState');
    expect(privStruct).toBeDefined();
    expect(privStruct?.kind).toBe('class');
    expect(privStruct?.exported).toBe(false);
    expect(signals.exports).not.toContain('PrivateState');

    // Enums
    const enumSym = signals.symbols.find((s) => s.name === 'AppError');
    expect(enumSym).toBeDefined();
    expect(enumSym?.kind).toBe('type');
    expect(enumSym?.exported).toBe(true);
    expect(signals.exports).toContain('AppError');

    // Traits
    const traitSym = signals.symbols.find((s) => s.name === 'Repository');
    expect(traitSym).toBeDefined();
    expect(traitSym?.kind).toBe('interface');
    expect(traitSym?.exported).toBe(true);
    expect(signals.exports).toContain('Repository');

    // Type alias
    const typeSym = signals.symbols.find((s) => s.name === 'AppResult');
    expect(typeSym).toBeDefined();
    expect(typeSym?.kind).toBe('type');
    expect(typeSym?.exported).toBe(true);

    // Constants
    const constPub = signals.symbols.find((s) => s.name === 'MAX_WORKERS');
    expect(constPub).toBeDefined();
    expect(constPub?.kind).toBe('const');
    expect(constPub?.exported).toBe(true);

    const constPriv = signals.symbols.find((s) => s.name === 'TIMEOUT_SEC');
    expect(constPriv).toBeDefined();
    expect(constPriv?.kind).toBe('const');
    expect(constPriv?.exported).toBe(false);

    // Functions
    const fnPub = signals.symbols.find((s) => s.name === 'start_server');
    expect(fnPub).toBeDefined();
    expect(fnPub?.kind).toBe('function');
    expect(fnPub?.exported).toBe(true);
    expect(signals.exports).toContain('start_server');

    const fnPriv = signals.symbols.find((s) => s.name === 'internal_worker');
    expect(fnPriv).toBeDefined();
    expect(fnPriv?.kind).toBe('function');
    expect(fnPriv?.exported).toBe(false);

    // Impl blocks
    const implTrait = signals.symbols.find((s) => s.name === 'impl Repository for ServerConfig');
    expect(implTrait).toBeDefined();
    expect(implTrait?.kind).toBe('class');

    const implSelf = signals.symbols.find((s) => s.name === 'impl ServerConfig');
    expect(implSelf).toBeDefined();
    expect(implSelf?.kind).toBe('class');
  });

  it('extracts Actix-web and Axum route handlers', () => {
    const code = `
#[get("/api/v1/metrics")]
pub async fn metrics_handler() -> impl Responder {
    "ok"
}

#[post("/api/v1/auth/login")]
pub async fn login_handler() -> impl Responder {
    "token"
}

pub fn create_router() -> Router {
    Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/users", post(create_user))
}
`;

    const signals = parseMultiLangFile('src/routes.rs', 'rust', code);

    expect(signals.routes).toContain('GET /api/v1/metrics');
    expect(signals.routes).toContain('POST /api/v1/auth/login');
    expect(signals.routes).toContain('GET /api/v1/health');
    expect(signals.routes).toContain('POST /api/v1/users');

    const routeSym = signals.symbols.find((s) => s.name === 'GET /api/v1/metrics');
    expect(routeSym).toBeDefined();
    expect(routeSym?.kind).toBe('route');
    expect(routeSym?.exported).toBe(true);
  });
});

describe('parseMultiLangFile - SQL (.sql)', () => {
  it('extracts tables, views, materialized views, functions, triggers, and types', () => {
    const code = `
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TEMPORARY TABLE temp_sessions (
    token VARCHAR(64) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "accounts" (
    id UUID PRIMARY KEY,
    user_id INT REFERENCES users(id)
);

CREATE VIEW active_users AS
SELECT id, email FROM users WHERE deleted_at IS NULL;

CREATE OR REPLACE MATERIALIZED VIEW daily_stats AS
SELECT count(*) AS total_users FROM users;

CREATE OR REPLACE FUNCTION update_user_status(user_id INT, status TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users SET status = status WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE clean_stale_tokens()
LANGUAGE SQL AS $$
    DELETE FROM temp_sessions;
$$;

CREATE TRIGGER on_user_updated
AFTER UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_user_status();

CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION pgcrypto;
`;

    const signals = parseMultiLangFile('migrations/schema.sql', 'sql', code);

    // Tables
    expect(signals.exports).toContain('users');
    expect(signals.exports).toContain('temp_sessions');
    expect(signals.exports).toContain('accounts');
    const tableSym = signals.symbols.find((s) => s.name === 'users');
    expect(tableSym).toBeDefined();
    expect(tableSym?.kind).toBe('class');
    expect(tableSym?.exported).toBe(true);

    // Views
    expect(signals.exports).toContain('active_users');
    expect(signals.exports).toContain('daily_stats');
    const viewSym = signals.symbols.find((s) => s.name === 'active_users');
    expect(viewSym).toBeDefined();
    expect(viewSym?.kind).toBe('type');

    // Functions & Procedures
    expect(signals.exports).toContain('update_user_status');
    expect(signals.exports).toContain('clean_stale_tokens');
    const fnSym = signals.symbols.find((s) => s.name === 'update_user_status');
    expect(fnSym).toBeDefined();
    expect(fnSym?.kind).toBe('function');

    // Triggers
    const triggerSym = signals.symbols.find((s) => s.name === 'on_user_updated');
    expect(triggerSym).toBeDefined();
    expect(triggerSym?.kind).toBe('function');

    // Types
    expect(signals.exports).toContain('user_role');
    const typeSym = signals.symbols.find((s) => s.name === 'user_role');
    expect(typeSym).toBeDefined();
    expect(typeSym?.kind).toBe('type');

    // Extensions
    expect(signals.externalDeps).toContain('uuid-ossp');
    expect(signals.externalDeps).toContain('pgcrypto');
  });

  it('detects RPC / API routes and referenced table dependencies in SQL', () => {
    const code = `
CREATE OR REPLACE FUNCTION api.get_profile(user_id INT)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object('id', user_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE PROCEDURE rpc_reset_credentials(email TEXT)
LANGUAGE SQL AS $$
    UPDATE credentials SET reset = true WHERE user_email = email;
$$;

-- Table references
SELECT o.id, c.name, p.title
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN line_items l ON l.order_id = o.id
REFERENCES products(id);
`;

    const signals = parseMultiLangFile('api/queries.sql', 'sql', code);

    // RPC routes
    expect(signals.routes).toContain('RPC api.get_profile');
    expect(signals.routes).toContain('RPC rpc_reset_credentials');

    // Referenced tables extracted as imports
    expect(signals.imports).toContain('orders');
    expect(signals.imports).toContain('customers');
    expect(signals.imports).toContain('line_items');
    expect(signals.imports).toContain('products');
  });
});

describe('parseMultiLangFile - Dockerfile', () => {
  it('extracts multi-stage builds, base image external deps, and stage imports', () => {
    const code = `
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM alpine:3.19 AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
ARG BUILD_ID=100
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000 8080/tcp
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
`;

    const signals = parseMultiLangFile('Dockerfile', 'dockerfile', code);

    // Base images as externalDeps
    expect(signals.externalDeps).toContain('node:20-alpine');
    expect(signals.externalDeps).toContain('alpine:3.19');

    // Stage symbols and exports
    expect(signals.exports).toContain('stage:builder');
    expect(signals.exports).toContain('stage:runner');

    const builderSym = signals.symbols.find((s) => s.name === 'stage:builder');
    expect(builderSym).toBeDefined();
    expect(builderSym?.kind).toBe('module');
    expect(builderSym?.exported).toBe(true);

    // Stage imports via COPY --from=stage
    expect(signals.imports).toContain('stage:builder');

    // Exposed ports as routes
    expect(signals.routes).toContain('PORT 3000');
    expect(signals.routes).toContain('PORT 8080/tcp');
    const portSym = signals.symbols.find((s) => s.name === 'PORT 3000');
    expect(portSym).toBeDefined();
    expect(portSym?.kind).toBe('route');

    // Entrypoint and CMD
    const entrySym = signals.symbols.find((s) => s.name === 'ENTRYPOINT');
    expect(entrySym).toBeDefined();
    expect(entrySym?.kind).toBe('function');

    const cmdSym = signals.symbols.find((s) => s.name === 'CMD');
    expect(cmdSym).toBeDefined();
    expect(cmdSym?.kind).toBe('function');

    // ARG and ENV variables
    const argSym = signals.symbols.find((s) => s.name === 'BUILD_ID');
    expect(argSym).toBeDefined();
    expect(argSym?.kind).toBe('const');

    const envSym = signals.symbols.find((s) => s.name === 'NODE_ENV');
    expect(envSym).toBeDefined();
    expect(envSym?.kind).toBe('const');

    const portEnv = signals.symbols.find((s) => s.name === 'PORT');
    expect(portEnv).toBeDefined();
    expect(portEnv?.kind).toBe('const');
  });
});

describe('extractFileSignals - Universal Dispatcher', () => {
  it('dispatches Go files to Go extractor', () => {
    const goCode = `
package worker

import "github.com/google/uuid"

func ProcessTask(id string) error {
    return nil
}
`;
    const signals = extractFileSignals('backend/worker.go', 'go', goCode);
    expect(signals.exports).toContain('worker');
    expect(signals.exports).toContain('ProcessTask');
    expect(signals.imports).toContain('github.com/google/uuid');
    expect(signals.externalDeps).toContain('github.com/google/uuid');
  });

  it('dispatches Rust files to Rust extractor', () => {
    const rsCode = `
pub mod engine;
use axum::Router;

pub struct State {
    pub ready: bool,
}

pub fn init() -> State {
    State { ready: true }
}
`;
    const signals = extractFileSignals('src/main.rs', 'rust', rsCode);
    expect(signals.exports).toContain('engine');
    expect(signals.exports).toContain('State');
    expect(signals.exports).toContain('init');
    expect(signals.externalDeps).toContain('axum');
  });

  it('dispatches SQL files to SQL extractor', () => {
    const sqlCode = `
CREATE TABLE audit_trail (
    id SERIAL PRIMARY KEY,
    action TEXT
);
CREATE OR REPLACE FUNCTION api.record_event(act TEXT) RETURNS VOID AS $$
BEGIN
    INSERT INTO audit_trail(action) VALUES (act);
END;
$$ LANGUAGE plpgsql;
`;
    const signals = extractFileSignals('db/audit.sql', 'sql', sqlCode);
    expect(signals.exports).toContain('audit_trail');
    expect(signals.exports).toContain('api.record_event');
    expect(signals.routes).toContain('RPC api.record_event');
  });

  it('dispatches Dockerfile to Dockerfile extractor', () => {
    const dockerCode = `
FROM golang:1.22-alpine AS build
EXPOSE 8000
CMD ["/app/bin"]
`;
    const signals = extractFileSignals('Dockerfile', 'dockerfile', dockerCode);
    expect(signals.exports).toContain('stage:build');
    expect(signals.externalDeps).toContain('golang:1.22-alpine');
    expect(signals.routes).toContain('PORT 8000');
  });

  it('dispatches TypeScript and JavaScript files via sibling astParserJs', () => {
    const tsCode = `
import { readFile } from 'node:fs/promises';
import express from 'express';

export const API_PORT = 4000;

export class HealthCheckService {
  check(): boolean {
    return true;
  }
}

export function startServer(): void {
  const app = express();
  app.get('/health', (req, res) => res.send('OK'));
}
`;
    const signals = extractFileSignals('src/index.ts', 'typescript', tsCode);
    expect(signals).toBeDefined();
    expect(signals.symbols.length).toBeGreaterThan(0);

    const portSym = signals.symbols.find((s) => s.name === 'API_PORT');
    expect(portSym).toBeDefined();

    const classSym = signals.symbols.find((s) => s.name === 'HealthCheckService');
    expect(classSym).toBeDefined();

    const fnSym = signals.symbols.find((s) => s.name === 'startServer');
    expect(fnSym).toBeDefined();
  });

  it('dispatches Python files via sibling astParserPy', () => {
    const pyCode = `
import os
import requests
from fastapi import FastAPI

app = FastAPI()

class WorkerService:
    def execute(self) -> str:
        return "done"

@app.get("/api/v1/ping")
def ping():
    return {"status": "ok"}
`;
    const signals = extractFileSignals('app/main.py', 'python', pyCode);
    expect(signals).toBeDefined();
    expect(signals.imports).toContain('requests');
    expect(signals.imports).toContain('fastapi');
    expect(signals.externalDeps).toContain('requests');

    const classSym = signals.symbols.find((s) => s.name === 'WorkerService');
    expect(classSym).toBeDefined();
    expect(classSym?.kind).toBe('class');

    const methodSym = signals.symbols.find((s) => s.name === 'execute');
    expect(methodSym).toBeDefined();
    expect(methodSym?.kind).toBe('method');
  });

  it('parses manifest package.json files correctly', () => {
    const manifestJson = JSON.stringify({
      name: 'my-service',
      version: '1.2.3',
      main: 'dist/index.js',
      dependencies: {
        express: '^4.18.2',
        cors: '^2.8.5',
      },
      devDependencies: {
        typescript: '^5.0.0',
        vitest: '^3.0.0',
      },
      scripts: {
        build: 'tsc',
        test: 'vitest run',
      },
    });

    const signals = extractFileSignals('package.json', '', manifestJson);
    expect(signals.exports).toContain('my-service');
    expect(signals.exports).toContain('dist/index.js');
    expect(signals.externalDeps).toContain('express');
    expect(signals.externalDeps).toContain('cors');
    expect(signals.externalDeps).toContain('typescript');
    expect(signals.imports).toContain('express');

    const scriptBuild = signals.symbols.find((s) => s.name === 'npm run build');
    expect(scriptBuild).toBeDefined();
    expect(scriptBuild?.kind).toBe('function');
  });

  it('parses manifest go.mod files correctly', () => {
    const goMod = `
module github.com/owner/my-go-app

go 1.22

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/google/uuid v1.6.0
)

require github.com/stretchr/testify v1.8.4
`;

    const signals = extractFileSignals('go.mod', '', goMod);
    expect(signals.exports).toContain('github.com/owner/my-go-app');
    expect(signals.externalDeps).toContain('github.com/gin-gonic/gin');
    expect(signals.externalDeps).toContain('github.com/google/uuid');
    expect(signals.externalDeps).toContain('github.com/stretchr/testify');
  });

  it('parses manifest Cargo.toml files correctly', () => {
    const cargoToml = `
[package]
name = "my-crate"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
serde = "1.0"

[dev-dependencies]
tempfile = "3.0"

[[bin]]
name = "cli-tool"
path = "src/bin/cli.rs"
`;

    const signals = extractFileSignals('Cargo.toml', '', cargoToml);
    expect(signals.exports).toContain('my-crate');
    expect(signals.exports).toContain('cli-tool');
    expect(signals.externalDeps).toContain('tokio');
    expect(signals.externalDeps).toContain('serde');
    expect(signals.externalDeps).toContain('tempfile');
  });

  it('handles unknown / generic languages with fallback parser without throwing', () => {
    const genericCode = `
require 'net/http'

class RemoteWorker
  def perform(task_id)
    puts "working"
  end
end
`;

    const signals = extractFileSignals('script.rb', 'ruby', genericCode);
    expect(signals).toBeDefined();
    expect(signals.imports).toContain('net/http');
    expect(signals.exports).toContain('RemoteWorker');
    expect(signals.exports).toContain('perform');
  });

  it('sanitizes and deduplicates all returned signals', () => {
    const goCode = `
package dedupe

import "fmt"
import "fmt"

func Helper() {}
`;
    const signals = extractFileSignals('dedupe.go', 'go', goCode);
    const fmtOccurrences = signals.imports.filter((imp) => imp === 'fmt');
    expect(fmtOccurrences.length).toBe(1);
  });
});
