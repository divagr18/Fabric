import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeAgent } from '../transport/nodeAgent';
import { ChannelKind } from '../transport/channel';
import { deviceLabel, myPeerId } from '../transport/protocol';
import { SignalingStatus } from '../transport/signaling';
import { sendBlob } from '../transport/blob';
import { GrantStore, supportsFolders } from '../capabilities/grants';
import { generateSampleFiles } from '../capabilities/samples';
import { dataList, dataRead } from '../capabilities/data';
import { Embedder, EmbedStatus } from '../capabilities/embed';
import { ocrFiles, ocrCapability } from '../capabilities/ocr';
import { HumanController, HumanRequest, HumanRequestCard, NoticeToasts, humanCapability } from '../capabilities/human';
import { Log, stamp } from '../ui/Log';

export function NodePage({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [kind, setKind] = useState<ChannelKind>('relay');
  const [lines, setLines] = useState<string[]>([]);
  const addLine = (l: string) => setLines((prev) => [...prev.slice(-199), stamp(l)]);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>({ state: 'idle' });
  const [, bump] = useState(0); // re-render on grant/human changes
  const photoInput = useRef<HTMLInputElement>(null);

  const { store, embedder, human, agent } = useMemo(() => {
    const store = new GrantStore();
    const embedder = new Embedder();
    const human = new HumanController();
    const agent = new NodeAgent(roomCode, myPeerId(), deviceLabel(), () => [
      ...store.capabilities(),
      embedder.capability(),
      ocrCapability(),
      humanCapability(),
    ]);

    agent.register('data.list', (args) => dataList(store, args));
    agent.register('data.read', (args, ctx) => dataRead(store, ctx.link, args));
    agent.register('compute.embed', (args) => embedder.embed(store, args));
    agent.register('compute.embed_text', async (args) => {
      const { texts } = args as { texts: string[] };
      if (!Array.isArray(texts) || texts.length === 0) throw new Error('texts[] required');
      return { vectors: await embedder.embedTexts(texts) };
    });
    agent.register('compute.ocr', (args) => ocrFiles(store, args));
    agent.register('human.notify', (args) => {
      const message = String((args as { message?: unknown }).message ?? '').slice(0, 300);
      if (!message) throw new Error('human.notify needs a "message"');
      human.notify(message);
      return { delivered: true };
    });
    agent.register('human.request', async (args, ctx) => {
      const answer = await human.request(args as HumanRequest);
      if (answer.kind === 'capture') {
        const transferId = await sendBlob(ctx.link, {
          name: answer.file.name || 'capture.jpg',
          mime: answer.file.type || 'image/jpeg',
          arrayBuffer: () => answer.file.arrayBuffer(),
        });
        return { kind: 'capture', transferId, name: answer.file.name, mime: answer.file.type, size: answer.file.size };
      }
      return answer;
    });
    return { store, embedder, human, agent };
  }, [roomCode]);

  useEffect(() => {
    const unsubs = [
      agent.on('log', addLine),
      agent.on('status', setStatus),
      agent.on('kind', setKind),
      store.onChange(() => {
        agent.advertise();
        bump((n) => n + 1);
        // Pre-warm the embedding model at consent time, not mid-agent-call —
        // the download happens while the user is still setting up.
        void embedder.warmup().catch(() => { /* surfaced via status */ });
      }),
    ];
    embedder.onStatus = (s) => {
      setEmbedStatus(s);
      if (s.state === 'ready') agent.advertise(); // backend name is now honest
    };
    human.onChange = () => bump((n) => n + 1);
    agent.start();

    // Keep the screen (and therefore the node) alive — phones drop off the
    // fabric when the display sleeps.
    let lock: { release?: () => Promise<void> } | null = null;
    const acquireLock = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } })
          .wakeLock?.request('screen') ?? null;
      } catch { /* not supported / not visible — best effort */ }
    };
    void acquireLock();
    const onVisible = () => { if (document.visibilityState === 'visible') void acquireLock(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release?.();
      unsubs.forEach((u) => u());
      agent.stop();
    };
  }, [agent, store, embedder, human]);

  useEffect(() => {
    document.title = `Fabric · node ${roomCode}`;
  }, [roomCode]);

  const grants = store.list();

  return (
    <div>
      <h1>Fabric <span className="dim">· node</span></h1>
      <p>
        <span className={`badge status-${status}`}>{status}</span>{' '}
        <span className={`badge ${kind}`}>{kind}</span>{' '}
        <span className="dim">room</span> <code>{roomCode}</code>{' '}
        <span className="dim">as</span> <code>{deviceLabel()}</code>
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>What this device shares</h2>
        {grants.length === 0 && <p className="dim">Nothing yet. The fabric can only reach what you share.</p>}
        {grants.map((g) => (
          <p key={g.capId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span><strong>{g.name}</strong> <span className="dim">— {g.files.length} files shared</span></span>
            <button onClick={() => { store.revoke(g.capId); addLine(`stopped sharing ${g.name}`); }}>
              stop sharing
            </button>
          </p>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {supportsFolders && (
            <button onClick={async () => {
              try {
                const g = await store.addFolder();
                addLine(`shared ${g.name} (${g.files.length} files)`);
              } catch { /* user cancelled the picker */ }
            }}>
              📁 Share a folder
            </button>
          )}
          <button onClick={() => photoInput.current?.click()}>🖼 Share photos</button>
          <button onClick={async () => {
            const files = await generateSampleFiles();
            store.addFiles(files, 'sample files (generated)', 'samples');
            addLine(`shared ${files.length} generated sample files (watermarked SAMPLE)`);
          }}>🧪 Use sample files</button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) {
                const g = store.addPhotos(e.target.files);
                addLine(`shared ${g.files.length} selected photos`);
              }
              e.target.value = '';
            }}
          />
        </div>
        <p className="dim" style={{ marginBottom: 0 }}>
          embed model: {embedStatus.state === 'ready' ? `ready (${embedStatus.backend})`
            : embedStatus.state === 'loading' ? (
              embedStatus.pct != null
                ? `downloading ${embedStatus.pct}% (${embedStatus.mb}/${embedStatus.mbTotal} MB)`
                : `downloading… ${embedStatus.mb ?? 0} MB so far`
            )
            : embedStatus.state === 'error' ? `error — ${embedStatus.error}`
            : 'downloads when you share files'}
        </p>
      </div>

      <h2>Log</h2>
      <Log lines={lines} />

      {human.active && <HumanRequestCard active={human.active} />}
      <NoticeToasts notices={human.notices} />
    </div>
  );
}
