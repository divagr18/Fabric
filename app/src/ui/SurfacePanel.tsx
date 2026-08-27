import { useEffect, useState } from 'react';
import { RegisteredTool, WebMcpRegistry } from '../webmcp/registry';

/** Live view of the WebMCP tool surface — the thing the judge watches mutate. */
export function SurfacePanel({ registry }: { registry: WebMcpRegistry }) {
  const [tools, setTools] = useState<RegisteredTool[]>(registry.list());

  useEffect(() => {
    registry.on(() => setTools(registry.list()));
    setTools(registry.list());
  }, [registry]);

  const core = tools.filter((t) => t.origin === 'core');
  const compiled = tools.filter((t) => t.origin === 'compiled');

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>WebMCP surface</h2>
      {!registry.available && (
        <p className="dim">
          No agent attached — open this page in ChatGPT's browser or Chrome with
          WebMCP enabled (<code>chrome://flags/#enable-webmcp-testing</code>).
          Everything else works regardless.
        </p>
      )}
      <p className="dim" style={{ margin: '4px 0' }}>CORE</p>
      {core.map((t) => (
        <p key={t.def.name} style={{ margin: '2px 0' }}>● <code>{t.def.name}</code></p>
      ))}
      <p className="dim" style={{ margin: '10px 0 4px' }}>COMPILED</p>
      {compiled.length === 0 && <p className="dim" style={{ margin: 0 }}>none yet — the agent compiles these at runtime</p>}
      {compiled.map((t) => (
        <p key={t.def.name} style={{ margin: '2px 0', display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
          <span>⚡ <code>{t.def.name}</code>{' '}
            <span className="badge" title={`${t.pipeline?.stages.length ?? '?'} stages`}>
              v{t.version} · {t.pipeline?.stages.length ?? '?'}st
            </span>
            {t.health === 'degraded' && <span className="badge" style={{ color: 'var(--bad)', borderColor: 'var(--bad)', marginLeft: 4 }}>degraded</span>}
          </span>
          <button style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => registry.revoke(t.def.name)}>revoke</button>
        </p>
      ))}
    </div>
  );
}
