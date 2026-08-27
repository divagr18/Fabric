import { Message, PeerId, makeEnvelope } from './protocol';
import { RtcSession } from './rtc';
import { Signaling } from './signaling';

export type ChannelKind = 'p2p' | 'relay';

/**
 * PeerLink — everything above transport sends through this and never knows
 * which pipe carried the message. Prefers the DataChannel when open,
 * silently falls back to the room-DO relay otherwise.
 */
export class PeerLink {
  rtc: RtcSession | null = null;

  constructor(
    private selfId: PeerId,
    private remote: PeerId | 'host',
    private signaling: Signaling,
  ) {}

  get kind(): ChannelKind {
    return this.rtc?.open ? 'p2p' : 'relay';
  }

  send(msg: Message, id?: string) {
    const env = makeEnvelope(this.selfId, this.remote, msg, id);
    if (this.rtc?.send(env)) return;
    this.signaling.send(env);
  }

  close() {
    this.rtc?.close();
    this.rtc = null;
  }
}

/** Dev flag: append ?relay=1 to force relay-only transport (skips WebRTC entirely). */
export function forceRelay(): boolean {
  return new URLSearchParams(location.search).get('relay') === '1';
}
