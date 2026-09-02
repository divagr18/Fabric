import { useEffect, useState } from 'react';
import { RegisteredTool, WebMcpRegistry } from '../webmcp/registry';

/** Live view of the WebMCP tool surface — the thing the judge watches mutate. */
export function SurfacePanel({ registry }: { registry: WebMcpRegistry }) {
  const [tools, setTools] = useState<RegisteredTool[]>(registry.list());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    registry.on(() => setTools(registry.list()));
    setTools(registry.list());
  }, [registry]);

  const core = tools.filter((t) => t.origin === 'core');
  const compiled = tools.filter((t) => t.origin === 'compiled');
  const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

  return (
    <div className="panel">
      <h2>WebMCP surface</h2>
      {!registry.available && (
        <p className="dim">
          No agent attached — open this page in ChatGPT's browser or Chrome with
          WebMCP enabled (<code>chrome://flags/#enable-webmcp-testing</code>).
          Everything else works regardless.
        </p>
      )}
      <p className="dim" style={{ margin: '4px 0' }}>CORE</p>
      {core.map((t) => (
        <p key={t.def.name} style={{ margin: '2px 0' }}>
          ● <code>{t.def.name}</code>
          {t.calls > 0 && <span className="dim"> · {t.calls}×</span>}
        </p>
      ))}
      <p className="dim" style={{ margin: '10px 0 4px' }}>COMPILED</p>
      {compiled.length === 0 && <p className="dim" style={{ margin: 0 }}>none yet — the agent compiles these at runtime</p>}
      {compiled.map((t) => (
        <div key={t.def.name} className="tool-row">
          <p style={{ margin: '2px 0', display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
            <span
              className="tool-name-btn"
              title="show pipeline"
              onClick={() => setExpanded(expanded === t.def.name ? null : t.def.name)}
            >
              ⚡ <code>{t.def.name}</code>{' '}
              <span className="badge">
                v{t.version} · {t.pipeline?.stages.length ?? '?'}st
                {t.calls > 0 && ` · ${t.calls}×`}
                {t.lastMs != null && ` · ${fmtMs(t.lastMs)}`}
              </span>
              {t.health === 'degraded' && <span className="badge" style={{ color: 'var(--bad)', borderColor: 'var(--bad)', marginLeft: 4 }}>degraded</span>}
            </span>
            <button style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => registry.revoke(t.def.name)}>revoke</button>
          </p>
          {expanded === t.def.name && t.pipeline && (
            <div className="flow tool-pipe">
              {t.pipeline.stages.map((s, i) => (
                <span key={s.id} style={{ display: 'contents' }}>
                  {i > 0 && <span className="flow-arrow">→</span>}
                  <span className="flow-stage">
                    <b>{s.method}</b>
                    <small>@ {s.node === 'host' ? 'host' : s.node.slice(0, 8)}</small>
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <details className="raw-surface" style={{ marginTop: 12 }}>
        <summary>what the agent sees (raw tool schemas)</summary>
        <pre>{JSON.stringify(
          tools.map((t) => ({ name: t.def.name, description: t.def.description, inputSchema: t.def.inputSchema })),
          null, 2,
        )}</pre>
      </details>
    </div>
  );
}
