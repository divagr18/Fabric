import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Hub, NodeView } from '../transport/hub';
import { deviceLabel, makeRoomCode, myPeerId } from '../transport/protocol';
import { SignalingStatus } from '../transport/signaling';
import { WebMcpRegistry } from '../webmcp/registry';
import { Banner, installCoreSurface } from '../webmcp/surface';
import { SurfacePanel } from '../ui/SurfacePanel';
import { TopologyMap } from '../ui/TopologyMap';
import { Log, stamp } from '../ui/Log';

function useRoomCode(): string {
  return useMemo(() => {
    const url = new URL(location.href);
    let code = url.searchParams.get('code')?.toUpperCase() ?? '';
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      code = makeRoomCode();
      url.searchParams.set('code', code);
      history.replaceState(null, '', url.toString());
    }
    return code;
  }, []);
}

export function HostPage() {
  const roomCode = useRoomCode();
  const [nodes, setNodes] = useState<NodeView[]>([]);
  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [lines, setLines] = useState<string[]>([]);
  const [qr, setQr] = useState<string>('');
  const [approvals, setApprovals] = useState<Array<{ what: string; resolve: (ok: boolean) => void }>>([]);
  const [hotReloads, setHotReloads] = useState(0);
  const [stages, setStages] = useState<Array<{ id: string; method: string; node: string; status: string; startedAt: number; ms?: number }>>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; score?: number } | null>(null);
  const [artifact, setArtifact] = useState<{ url: string; name: string } | null>(null);
  const [agentCalls, setAgentCalls] = useState<Array<{ callId: string; name: string; args: string; status: 'running' | 'ok' | 'err'; ms?: number }>>([]);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfaceInstalled = useRef(false);

  const joinUrl = `${location.origin}/r/${roomCode}`;
  const registry = useMemo(() => new WebMcpRegistry(), []);
  const hub = useMemo(() => new Hub(roomCode, myPeerId(), deviceLabel()), [roomCode]);

  useEffect(() => {
    const addLine = (l: string) => setLines((prev) => [...prev.slice(-199), stamp(l)]);
    const unsubs = [
      hub.on('log', addLine),
      hub.on('nodes', setNodes),
      hub.on('status', setStatus),
    ];
    unsubs.push(registry.on((e) => {
      if (e.type === 'registered' && e.origin === 'compiled') addLine(`⚡ + ${e.name} REGISTERED via WebMCP`);
      else if (e.type === 'swapped') {
        addLine(`🔥 ${e.name} hot-swapped → v${e.version}`);
        setHotReloads((n) => n + 1);
      } else if (e.type === 'revoked') {
        addLine(`− ${e.name} revoked`);
        hub.deleteTool(e.name); // remove from the fabric's persistent storage too
      } else if (e.type === 'call_start') {
        setAgentCalls((prev) => [...prev.slice(-4), { callId: e.callId, name: e.name, args: e.args, status: 'running' as const }]);
      } else if (e.type === 'call_end') {
        setAgentCalls((prev) => prev.map((c) => c.callId === e.callId ? { ...c, status: e.ok ? 'ok' as const : 'err' as const, ms: e.ms } : c));
      }
    }));
    // Core tools + hot-reload manager attach exactly once — hub identity is
    // stable across StrictMode/HMR remounts, so this is safe.
    if (!surfaceInstalled.current) {
      surfaceInstalled.current = true;
      installCoreSurface(registry, hub, {
      onLog: addLine,
      onApprove: (what) => new Promise<boolean>((resolve) => {
        // FIFO queue — a second concurrent approval must never orphan the first
        setApprovals((prev) => [...prev, { what, resolve: (ok) => { setApprovals((q) => q.slice(1)); resolve(ok); } }]);
      }),
      onBanner: (b) => {
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        setBanner(b);
        if (b && b.kind !== 'compiling' && b.kind !== 'replanning') {
          bannerTimer.current = setTimeout(() => setBanner(null), 5000);
        }
      },
      onRunStart: () => setStages([]),
      onStage: (stage, status, detail) => {
        addLine(`stage ${stage.id} [${stage.method} @ ${stage.node === 'host' ? 'host' : stage.node}] ${status}${detail ? ` — ${detail}` : ''}`);
        setStages((prev) => {
          const existing = prev.find((s) => s.id === stage.id);
          const next = prev.filter((s) => s.id !== stage.id);
          const startedAt = existing?.startedAt ?? performance.now();
          next.push({
            id: stage.id, method: stage.method, node: stage.node, status, startedAt,
            ms: status === 'done' || status === 'failed' ? Math.round(performance.now() - startedAt) : undefined,
          });
          return next.slice(-12);
        });
      },
      onPreview: (p) => {
        const url = URL.createObjectURL(new Blob([p.bytes.buffer as ArrayBuffer], { type: p.mime }));
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url, name: p.name, score: p.score };
        });
        addLine(`↓ result preview ${p.name} (${(p.bytes.length / 1024).toFixed(0)}KB) — fetched peer-to-peer`);
      },
      onArtifact: (a) => {
        const url = URL.createObjectURL(new Blob([a.bytes.buffer as ArrayBuffer], { type: a.mime }));
        addLine(`📄 artifact ready: ${a.name} (${(a.bytes.length / 1024).toFixed(0)}KB) — compiled locally`);
        setArtifact((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url, name: a.name };
        });
        const link = document.createElement('a');
        link.href = url;
        link.download = a.name;
        link.click();
      },
      });
    }
    // Start AFTER the surface attaches its listeners — stored_tools arrives
    // moments after the socket opens.
    hub.start();
    return () => {
      unsubs.forEach((u) => u());
      hub.stop();
    };
  }, [roomCode, registry, hub]);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 320, margin: 1 }).then(setQr).catch(() => {});
  }, [joinUrl]);

  useEffect(() => {
    const compiled = registry.list().filter((t) => t.origin === 'compiled').length;
    document.title = `Fabric · ${nodes.length} node${nodes.length === 1 ? '' : 's'}${compiled > 0 ? ` · ⚡${compiled}` : ''}`;
  }, [nodes, hotReloads, registry]);

  const log = (l: string) => setLines((prev) => [...prev.slice(-199), stamp(l)]);

  async function run(label: string, fn: () => Promise<string>) {
    log(`${label}…`);
    const t0 = performance.now();
    try {
      const summary = await fn();
      log(`✓ ${label} in ${Math.round(performance.now() - t0)}ms — ${summary}`);
    } catch (err) {
      log(`✗ ${label}: ${(err as Error).message}`);
    }
  }

  function firstDataCap(node: NodeView): string {
    const cap = node.caps.find((c) => c.kind === 'data');
    if (!cap) throw new Error(`${node.label} shares no data`);
    return cap.id;
  }

  async function firstImageId(hub: Hub, node: NodeView): Promise<string> {
    const { files } = (await hub.rpc(node.peerId, 'data.list', { capId: firstDataCap(node) })) as
      { files: { id: string; name: string; image: boolean }[] };
    const img = files.find((f) => f.image);
    if (!img) throw new Error(`${node.label} shares no images`);
    return img.id;
  }

  const tests: Array<{ name: string; fn: (hub: Hub, n: NodeView) => Promise<string> }> = [
    {
      name: 'list',
      fn: async (hub, n) => {
        const { files } = (await hub.rpc(n.peerId, 'data.list', { capId: firstDataCap(n) })) as
          { files: { name: string }[] };
        return `${files.length} files: ${files.slice(0, 3).map((f) => f.name).join(', ')}…`;
      },
    },
    {
      name: 'read',
      fn: async (hub, n) => {
        const { files } = (await hub.rpc(n.peerId, 'data.list', { capId: firstDataCap(n) })) as
          { files: { id: string; name: string }[] };
        if (!files.length) throw new Error('no files shared');
        const meta = (await hub.rpc(n.peerId, 'data.read', { fileId: files[0].id })) as { transferId: string };
        const blob = await hub.blobs.waitFor(meta.transferId);
        return `↓ ${blob.name} ${(blob.bytes.length / 1024).toFixed(1)}KB from ${n.label} (peer transfer, not cloud)`;
      },
    },
    {
      name: 'embed×5',
      fn: async (hub, n) => {
        const r = (await hub.rpc(n.peerId, 'compute.embed', { capId: firstDataCap(n), limit: 5 })) as
          { items: unknown[]; backend: string; ms: number };
        return `${r.items.length} vectors on ${n.label}'s ${r.backend} in ${r.ms}ms (vectors only crossed the wire)`;
      },
    },
    {
      name: 'ocr',
      fn: async (hub, n) => {
        const id = await firstImageId(hub, n);
        const r = (await hub.rpc(n.peerId, 'compute.ocr', { fileIds: [id] })) as
          { items: { text: string; confidence: number }[] };
        return `"${r.items[0].text.slice(0, 60).replace(/\s+/g, ' ')}…" (${r.items[0].confidence}% conf)`;
      },
    },
    {
      name: 'capture',
      fn: async (hub, n) => {
        const r = (await hub.rpc(n.peerId, 'human.request', {
          kind: 'capture', prompt: 'Fabric needs a photo of the paper document.',
        })) as { kind: string; transferId?: string };
        if (r.kind !== 'capture' || !r.transferId) return 'declined by the human';
        const blob = await hub.blobs.waitFor(r.transferId);
        return `↓ ${blob.name} ${(blob.bytes.length / 1024).toFixed(1)}KB captured by ${n.label}'s human`;
      },
    },
    {
      name: 'approve',
      fn: async (hub, n) => {
        const r = (await hub.rpc(n.peerId, 'human.request', {
          kind: 'approve', prompt: 'Approve compiling the packet?',
        })) as { kind: string; approved?: boolean };
        return r.kind === 'approve' ? (r.approved ? 'APPROVED ✓' : 'DENIED ✗') : 'declined';
      },
    },
  ];

  return (
    <div>
      {banner && (
        <div className={`banner b-${banner.kind}`}>{banner.text}</div>
      )}
      <h1>Fabric <span className="dim">· host</span></h1>
      <span className={`badge status-${status}`}>{status}</span>{' '}
      <span className="dim">room</span> <code>{roomCode}</code>

      <div className="weave" aria-hidden>
        {nodes.length === 0 && registry.list().filter((t) => t.origin === 'compiled').length === 0 && (
          <span className="weave-label">no threads yet — nodes and compiled tools appear here</span>
        )}
        {nodes.map((n) => (
          <span
            key={n.peerId}
            className={`knot${n.alive ? '' : ' knot-dim'}${n.caps.some((c) => c.kind === 'compute') ? ' knot-compute' : ''}`}
            title={n.label}
          />
        ))}
        {registry.list().filter((t) => t.origin === 'compiled').map((t) => (
          <span key={t.def.name} className="knot knot-spark" title={`⚡ ${t.def.name} v${t.version}`} />
        ))}
        {(nodes.length > 0 || registry.list().some((t) => t.origin === 'compiled')) && (
          <span className="weave-label" style={{ marginLeft: 'auto' }}>
            {nodes.length} device{nodes.length === 1 ? '' : 's'} · {registry.list().filter((t) => t.origin === 'compiled').length} compiled tool{registry.list().filter((t) => t.origin === 'compiled').length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="stats">
        <span className="stat">nodes<b>{nodes.length}</b></span>
        <span className="stat">compiled tools<b>{registry.list().filter((t) => t.origin === 'compiled').length}</b></span>
        <span className="stat">hot reloads<b>{hotReloads}</b></span>
        <span className="stat">peer transfers<b>{((hub.blobs.bytesReceived) / 1024).toFixed(0)} KB</b></span>
        <span className="stat stat-zero">raw file bytes to any cloud<b>0 B</b></span>
      </div>

      <div className="layout">
        <div className="col">
          <div className="panel">
            <h2>Join this fabric</h2>
            <p className="roomcode">{roomCode}</p>
            {qr && <img className="qr" src={qr} alt={`QR code for ${joinUrl}`} />}
            <p style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ minWidth: 0 }}>{joinUrl}</code>
              <button
                style={{ padding: '3px 10px', fontSize: 11, flex: 'none' }}
                onClick={() => { void navigator.clipboard.writeText(joinUrl); log('join link copied'); }}
              >copy</button>
            </p>
            <p className="dim" style={{ marginBottom: 0 }}>Scan with a phone, or open in a new tab — every browser becomes a node.</p>
          </div>
          <div className="panel">
            <h2>Try it</h2>
            <ol className="steps">
              <li>Open this page in <strong>ChatGPT's browser</strong> (or Chrome + <code>#enable-webmcp-testing</code>).</li>
              <li>Open the join link in a <strong>new tab</strong> → click <strong>🧪 Use sample files</strong>. Phone via QR = third device.</li>
              <li>Ask: <em>"Call inspect_fabric — what can this fabric do?"</em></li>
              <li>Then: <em>"Compile a tool that finds photos across my devices by description — find the dog."</em> Watch the tool appear mid-session and rank the dog first.</li>
              <li>Close the node tab, call it again — it <strong>hot-reloads</strong> under the same name. That's the point.</li>
              <li>Reload <em>this</em> page — your compiled tools come back and heal as devices rejoin. The fabric is a <strong>Durable Object</strong>; it outlives its devices.</li>
            </ol>
            <p className="dim" style={{ marginBottom: 0, fontSize: 12 }}>Every capability is explicitly shared. Raw files never touch a server — execution goes to the data.</p>
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <h2>Topology</h2>
            <TopologyMap
              nodes={nodes}
              busy={new Set(stages.filter((s) => s.status === 'running').map((s) => s.node))}
              hostLabel={deviceLabel()}
            />
          </div>
          <div className="panel">
            <h2>Nodes<span className="count">{nodes.length}</span></h2>
            {nodes.length === 0 && <p className="dim">none yet — waiting for devices</p>}
            <div className="nodes-grid">
              {nodes.map((n) => (
                <div key={n.peerId} className={`node-card${n.alive ? '' : ' stale'}${stages.some((s) => s.status === 'running' && s.node === n.peerId) ? ' busy' : ''}`}>
                  <strong>{n.label}</strong>
                  <span>
                    <span className={`badge ${n.kind}`}>{n.kind}</span>{' '}
                    {n.alive && n.rtt != null && <span className="badge">{n.rtt}ms</span>}{' '}
                    {!n.alive && <span className="badge">stale</span>}
                  </span>
                  <span>
                    {n.caps.map((c) => (
                      <span key={c.id} className={`badge chip-${c.kind}`} title={c.detail} style={{ marginRight: 4, marginBottom: 4 }}>
                        {c.name}
                      </span>
                    ))}
                    {n.caps.length === 0 && <span className="dim">nothing shared yet</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {tests.map((t) => (
                      <button
                        key={t.name}
                        style={{ padding: '4px 8px', fontSize: 12 }}
                        onClick={() => run(`${t.name} @ ${n.label}`, () => t.fn(hub, n))}
                      >
                        {t.name}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Log<span className="live-dot" aria-hidden /></h2>
            <Log lines={lines} />
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <h2>Agent</h2>
            {agentCalls.length === 0 && <p className="dim" style={{ margin: 0 }}>WebMCP calls from the agent appear here live</p>}
            {agentCalls.map((c) => (
              <p key={c.callId} className="agent-row">
                <span className="badge" style={{
                  color: c.status === 'ok' ? 'var(--ok)' : c.status === 'err' ? 'var(--bad)' : 'var(--compute)',
                  borderColor: c.status === 'ok' ? 'var(--ok)' : c.status === 'err' ? 'var(--bad)' : 'var(--compute)',
                }}>{c.status === 'running' ? '…' : c.status === 'ok' ? `✓${c.ms != null ? ` ${c.ms >= 1000 ? `${(c.ms / 1000).toFixed(1)}s` : `${c.ms}ms`}` : ''}` : '✗'}</span>
                <code>⟵ {c.name}</code>
                <span className="agent-args">{c.args}</span>
              </p>
            ))}
          </div>
          <SurfacePanel registry={registry} />
          <div className="panel">
            <h2>Execution</h2>
            {stages.length === 0 && <p className="dim" style={{ margin: 0 }}>the pipeline lights up here when a compiled tool runs</p>}
            <div className="flow">
              {stages.map((s, i) => (
                <span key={s.id} style={{ display: 'contents' }}>
                  {i > 0 && <span className="flow-arrow">→</span>}
                  <span className={`flow-stage fs-${s.status}${s.status === 'running' ? ' pulse' : ''}`}>
                    <b>{s.method}</b>
                    <small>@ {s.node === 'host' ? 'host' : (nodes.find((n) => n.peerId === s.node)?.label ?? s.node)}{s.ms != null && ` · ${s.ms >= 1000 ? `${(s.ms / 1000).toFixed(1)}s` : `${s.ms}ms`}`}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
          {preview && (
            <div className="panel">
              <h2>Result</h2>
              <img className="preview-img" src={preview.url} alt={preview.name} />
              <p className="dim" style={{ margin: '8px 0 0', fontSize: 12 }}>
                top match <code>{preview.name}</code>{preview.score != null && <> · score {preview.score}</>}<br />
                fetched peer-to-peer — never a server
              </p>
            </div>
          )}
          {artifact && (
            <div className="panel">
              <h2>Artifact</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <a href={artifact.url} download={artifact.name} style={{ flex: 1, textDecoration: 'none' }}>
                  <button style={{ width: '100%' }}>⬇ Download PDF</button>
                </a>
                <button style={{ flex: 1 }} onClick={() => window.open(artifact.url, '_blank')}>Open in tab</button>
              </div>
              <object data={artifact.url} type="application/pdf" style={{ width: '100%', height: 240, borderRadius: 6 }}>
                <p className="dim" style={{ margin: 0 }}>Inline preview not supported in this browser — use the buttons above.</p>
              </object>
              <p className="dim" style={{ margin: '8px 0 0', fontSize: 12 }}><code>{artifact.name}</code> — compiled on this device, never uploaded</p>
            </div>
          )}
        </div>
      </div>

      {approvals.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(1,4,9,0.9)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div className="panel human-card" style={{ maxWidth: 420, width: '100%' }}>
            <h2>Approval needed{approvals.length > 1 ? ` (1 of ${approvals.length})` : ''}</h2>
            <p style={{ fontSize: 16 }}>{approvals[0].what}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ flex: 1 }} onClick={() => approvals[0].resolve(true)}>✓ Approve</button>
              <button style={{ flex: 1 }} onClick={() => approvals[0].resolve(false)}>✗ Deny</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
