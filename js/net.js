/**
 * net.js — Playing together on the same wifi.
 *
 * Two phones talk directly to each other over WebRTC. Nothing about the game
 * runs on a server: the only outside help is a free "introduction service"
 * (PeerServer Cloud) that tells two browsers how to find each other, because
 * a browser cannot listen for incoming connections on its own. Once they are
 * introduced, every message goes phone-to-phone across the local wifi.
 *
 * Shape of a session:
 *   - Everyone opens the same `?room=...` address.
 *   - The first one to arrive claims the room and becomes the HOST.
 *   - Everyone else connects to the host.
 *   - The host collects everybody's position and passes the whole list back
 *     out, ten times a second.
 *
 * A star like this is not the most efficient arrangement, but with two to
 * four players it is easily fast enough and there is only one path for a
 * message to take, which makes it far easier to reason about than a mesh.
 *
 * DELIBERATELY NOT HERE: any chat, any typed name, any way to send words or
 * pictures between players. All that ever crosses the wire is where somebody
 * is and what colour their hat is. That is the whole point.
 *
 * If anything at all goes wrong — no room in the address, the library will
 * not load, the introduction service is down, nobody else joins — the game
 * carries on perfectly happily on its own. Multiplayer can only ever add.
 */

import { CONFIG } from './config.js';

/** Where the vendored library lives, relative to the page. */
const PEERJS_SRC = 'js/vendor/peerjs.min.js';

/**
 * The room name is turned into a peer id with a long prefix.
 *
 * The free introduction service is shared with every other project using it,
 * and its documentation warns that hand-picked ids can collide. A room called
 * "park" would be a coin toss; this makes a collision vanishingly unlikely.
 */
const ID_PREFIX = 'tarastown-v1-';

/** Read the room out of the address bar, or null for ordinary single player. */
export function roomFromUrl() {
  try {
    const room = new URLSearchParams(window.location.search).get('room');
    if (!room) return null;

    // Keep it to harmless characters: this ends up in a peer id.
    const clean = room.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    return clean.length >= 3 ? clean : null;
  } catch (err) {
    return null;
  }
}

/** Load the vendored library, once, only if we actually need it. */
function loadPeerLibrary() {
  if (window.Peer) return Promise.resolve(window.Peer);

  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = PEERJS_SRC;
    tag.async = true;
    tag.onload = () => window.Peer ? resolve(window.Peer) : reject(new Error('no Peer global'));
    tag.onerror = () => reject(new Error('could not load ' + PEERJS_SRC));
    document.head.appendChild(tag);
  });
}

export class Net {
  constructor(room) {
    this.room = room;
    this.hostId = ID_PREFIX + room;

    this.status = 'off';     // off | connecting | host | guest | failed
    this.isHost = false;
    this.peer = null;
    this.toHost = null;      // guests: the one connection, to the host
    this.guests = new Map(); // host: peerId -> connection

    /** Everyone else, by id: { x, y, angle, mode, hat, shirt, car, seen } */
    this.others = new Map();

    this._sendTimer = 0;
    this._me = null;
  }

  get playerCount() {
    return this.others.size + 1;
  }

  // =====================================================================
  // Joining
  // =====================================================================

  /**
   * Try to join the room. Never throws and never blocks the game: on any
   * failure the status simply becomes 'failed' and play carries on alone.
   */
  async join() {
    this.status = 'connecting';
    try {
      const Peer = await loadPeerLibrary();
      await this._claimRoomOrJoinIt(Peer);
    } catch (err) {
      console.warn('[net] could not join the room, playing alone.', err);
      this.status = 'failed';
    }
  }

  /**
   * Whoever gets here first claims the room id and hosts. Anyone arriving
   * later is told the id is taken, which is how they know to join instead.
   */
  _claimRoomOrJoinIt(Peer) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };

      const host = new Peer(this.hostId, { debug: 0 });

      host.on('open', () => {
        this.peer = host;
        this.isHost = true;
        this.status = 'host';
        host.on('connection', (conn) => this._acceptGuest(conn));
        console.info('[net] hosting room "' + this.room + '"');
        done();
      });

      host.on('error', (err) => {
        if (err && err.type === 'unavailable-id') {
          // Somebody else is already hosting. Join them.
          try { host.destroy(); } catch (_) {}
          this._joinAsGuest(Peer).then(done);
          return;
        }
        console.warn('[net] host attempt failed:', err && err.type);
        this.status = 'failed';
        done();
      });

      // Never leave the game hanging on a service that isn't answering.
      setTimeout(() => {
        if (!settled) {
          console.warn('[net] gave up waiting to join.');
          this.status = 'failed';
          done();
        }
      }, CONFIG.NET.JOIN_TIMEOUT_MS);
    });
  }

  _joinAsGuest(Peer) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };

      const guest = new Peer({ debug: 0 });   // a random id of our own

      guest.on('open', () => {
        this.peer = guest;
        const conn = guest.connect(this.hostId, { reliable: false });

        conn.on('open', () => {
          this.toHost = conn;
          this.isHost = false;
          this.status = 'guest';
          console.info('[net] joined room "' + this.room + '"');
          done();
        });
        conn.on('data', (msg) => this._onRoster(msg));
        conn.on('close', () => { this.toHost = null; this.others.clear(); this.status = 'failed'; });
        conn.on('error', (err) => {
          console.warn('[net] could not reach the host:', err && (err.type || err.message));
          this.status = 'failed';
          done();
        });
      });

      guest.on('error', (err) => {
        console.warn('[net] guest attempt failed:', err && err.type);
        this.status = 'failed';
        done();
      });

      setTimeout(done, CONFIG.NET.JOIN_TIMEOUT_MS);
    });
  }

  _acceptGuest(conn) {
    conn.on('open', () => {
      this.guests.set(conn.peer, conn);
      console.info('[net] somebody joined (' + this.guests.size + ' with us)');
    });
    conn.on('data', (msg) => {
      if (!msg || msg.t !== 'me') return;
      this.others.set(conn.peer, { ...msg.p, seen: 0 });
    });
    const drop = () => {
      this.guests.delete(conn.peer);
      this.others.delete(conn.peer);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  /** Guests: take the host's word for who is where. */
  _onRoster(msg) {
    if (!msg || msg.t !== 'all' || !Array.isArray(msg.p)) return;

    const fresh = new Set();
    for (const p of msg.p) {
      if (!p || p.id === this.peer.id) continue;   // not ourselves
      fresh.add(p.id);
      this.others.set(p.id, { ...p, seen: 0 });
    }
    for (const id of [...this.others.keys()]) {
      if (!fresh.has(id)) this.others.delete(id);
    }
  }

  // =====================================================================
  // Every frame
  // =====================================================================

  /**
   * @param me  { x, y, angle, mode, hat, shirt, car } — where we are and what
   *            we look like. Nothing else is ever sent.
   */
  update(dt, me) {
    if (this.status !== 'host' && this.status !== 'guest') return;
    this._me = me;

    // Forget anyone who has gone quiet, so a phone that walks out of range
    // doesn't leave a statue standing in the road.
    for (const [id, p] of this.others) {
      p.seen += dt;
      if (p.seen > CONFIG.NET.FORGET_AFTER_SECONDS) this.others.delete(id);
    }

    this._sendTimer += dt;
    if (this._sendTimer < 1 / CONFIG.NET.SENDS_PER_SECOND) return;
    this._sendTimer = 0;

    if (this.isHost) this._broadcastRoster();
    else this._sendMine();
  }

  _sendMine() {
    if (!this.toHost || !this.toHost.open) return;
    try { this.toHost.send({ t: 'me', p: this._me }); } catch (_) {}
  }

  _broadcastRoster() {
    const all = [{ id: this.peer.id, ...this._me }];
    for (const [id, p] of this.others) {
      all.push({ id, x: p.x, y: p.y, angle: p.angle, mode: p.mode, hat: p.hat, shirt: p.shirt, car: p.car });
    }

    const msg = { t: 'all', p: all };
    for (const conn of this.guests.values()) {
      if (conn.open) { try { conn.send(msg); } catch (_) {} }
    }
  }

  leave() {
    try { this.peer && this.peer.destroy(); } catch (_) {}
    this.others.clear();
    this.status = 'off';
  }
}
