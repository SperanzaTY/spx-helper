import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeMcpServerConfigs,
  parseCodexMcpConfigText,
  redactEnv,
} from './mcp-status.js';

test('parses Codex MCP TOML sections with args and env vars', () => {
  const parsed = parseCodexMcpConfigText(
    `
[mcp_servers.presto-query]
command = "uv"
args = ["run", "python", "-m", "presto"]
cwd = "."
env_vars = ["SPX_HELPER_ROOT"]
env = { SAFE_FLAG = "1", API_TOKEN = "secret-token" }

[mcp_servers.disabled-one]
command = "node"
enabled = false
`,
    '/repo/.codex/config.toml',
    { SPX_HELPER_ROOT: '/repo' },
  );

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.servers.length, 2);
  assert.deepEqual(parsed.servers[0], {
    name: 'presto-query',
    enabled: true,
    transport: 'stdio',
    command: 'uv',
    args: ['run', 'python', '-m', 'presto'],
    env: {
      SAFE_FLAG: '1',
      API_TOKEN: 'secret-token',
      SPX_HELPER_ROOT: '/repo',
    },
    cwd: '.',
    source: 'codex-project',
    sourcePath: '/repo/.codex/config.toml',
    raw: {
      command: 'uv',
      args: ['run', 'python', '-m', 'presto'],
      cwd: '.',
      env: {
        SAFE_FLAG: '1',
        API_TOKEN: 'secret-token',
        SPX_HELPER_ROOT: '/repo',
      },
    },
  });
  assert.equal(parsed.servers[1].enabled, false);
});

test('prefers user Codex config over project and Cursor configs when merging', () => {
  const merged = mergeMcpServerConfigs([
    {
      configPath: '/repo/.cursor/mcp.json',
      servers: [{
        name: 'presto-query',
        enabled: true,
        transport: 'stdio',
        command: 'cursor-presto',
        args: [],
        env: {},
        source: 'cursor',
        sourcePath: '/repo/.cursor/mcp.json',
        raw: {},
      }],
      errors: [],
    },
    {
      configPath: '/repo/.codex/config.toml',
      servers: [{
        name: 'presto-query',
        enabled: true,
        transport: 'stdio',
        command: 'project-presto',
        args: [],
        env: {},
        source: 'codex-project',
        sourcePath: '/repo/.codex/config.toml',
        raw: {},
      }],
      errors: [],
    },
    {
      configPath: '/home/.codex/config.toml',
      servers: [{
        name: 'presto-query',
        enabled: true,
        transport: 'stdio',
        command: 'user-presto',
        args: [],
        env: {},
        source: 'codex-user',
        sourcePath: '/home/.codex/config.toml',
        raw: {},
      }],
      errors: [],
    },
  ]);

  assert.equal(merged.servers.length, 1);
  assert.equal(merged.servers[0].command, 'user-presto');
  assert.equal(merged.servers[0].source, 'codex-user');
});

test('redacts sensitive environment keys', () => {
  assert.deepEqual(redactEnv({
    API_TOKEN: 'abc',
    password: 'pw',
    SAFE_FLAG: '1',
  }), {
    API_TOKEN: '<redacted>',
    password: '<redacted>',
    SAFE_FLAG: '1',
  });
});
