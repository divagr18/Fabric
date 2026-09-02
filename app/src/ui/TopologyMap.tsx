import { NodeView } from '../transport/hub';

/**
 * Live topology: the host hub at center, every node as a labeled knot around it,
 * edges colored by channel kind. An edge animates while a stage runs on that node.
 * Pure render over existing state — the picture of "N browsers, one machine".
 */
export function TopologyMap({ nodes, busy, hostLabel }: {
  nodes: NodeView[];
  busy: Set<string>;
  hostLabel: string;
}) {
  const W = 420, H = 230, CX = W / 2, CY = H / 2, RX = 150, RY = 78;
  const placed = nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { n, x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
  });
  const kindColor = (n: NodeView) =>
    n.caps.some((c) => c.kind === 'compute') ? 'var(--compute)' : 'var(--data)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="fabric topology">
      {placed.map(({ n, x, y }) => (
        <g key={`e-${n.peerId}`}>
          <line
            x1={CX} y1={CY} x2={x} y2={y}
            className={busy.has(n.peerId) ? 'topo-edge topo-busy' : 'topo-edge'}
            stroke={!n.alive ? 'var(--line)' : busy.has(n.peerId) ? 'var(--compute)' : n.kind === 'p2p' ? 'var(--ok)' : 'var(--warn)'}
          />
          <text x={(CX + x) / 2} y={(CY + y) / 2 - 5} className="topo-edge-label">
            {n.alive ? n.kind : 'lost'}{n.alive && n.rtt != null ? ` ${n.rtt}ms` : ''}
          </text>
        </g>
      ))}
      <rect
        x={CX - 7} y={CY - 7} width={14} height={14}
        transform={`rotate(45 ${CX} ${CY})`}
        fill="var(--thread)"
      />
      <text x={CX} y={CY + 24} className="topo-label topo-host">{hostLabel} · host</text>
      {placed.map(({ n, x, y }) => (
        <g key={n.peerId} opacity={n.alive ? 1 : 0.35}>
          <rect
            x={x - 6} y={y - 6} width={12} height={12}
            transform={`rotate(45 ${x} ${y})`}
            fill={kindColor(n)}
            className={busy.has(n.peerId) ? 'topo-knot-busy' : undefined}
          />
          <text x={x} y={y + (y > CY ? 22 : -14)} className="topo-label">{n.label}</text>
        </g>
      ))}
      {nodes.length === 0 && (
        <text x={CX} y={CY + 40} className="topo-label" opacity={0.6}>waiting for devices…</text>
      )}
    </svg>
  );
}
