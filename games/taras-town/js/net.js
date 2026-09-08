/**
 * net.js — Playing together on the same wifi.
 *
 * Two devices talk to each other over WebRTC. Nothing about the game runs on
 * a server, but two pieces of outside help are involved, and it is worth being
 * precise about what each one does:
 *
 *   - An INTRODUCTION service (PeerServer Cloud) tells two browsers how to
 *     find each other, because a browser cannot listen for incoming
 *     connections on its own. It is always used, and no game data goes
 *     through it.
 *
 *   - A RELAY (the TURN servers in the library's default settings) is used
 *     ONLY when a direct connection cannot be made — typically between two
 *     different networks with unhelpful routers. On the same wifi this never
 *     happens and the devices talk straight to each other. When it is used,
 *     positions do pass through somebody else's server; still no words and no
 *     names, because none are ever sent at all.
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
 * ONE PIECE OF TYPED TEXT CROSSES THE WIRE: the name a player chose for
 * himself, so that children playing together can tell each other apart. It is
 * capped at ten characters, stripped of control characters at both ends, and
 * drawn on a small sign over that player's head. It was once the case that
 * nothing typed was sent at all, and it is worth being clear about what that
 * change does and does not open up.
 *
 * STILL DELIBERATELY NOT HERE: any chat, any second message, any way to send
 * words or pictures after that name. There is no channel down which a
 * conversation could happen. Beyond the name, all that ever crosses the wire
 * is where somebody is and what colour their hat is.
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

    /** Everyone else, by id: { x, y, angle, mode, hat, shirt, car, name, seen } */
    this.others = new Map();

    this._sendTimer = 0;
    this._me = null;
    this._joining = false;
    this._retryIn = 0;
    this._silence = 0;      // how long since the host last said anything
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
    if (this._joining) return;
    this._joining = true;
    this.status = 'connecting';

    // Throw away any previous attempt, or its leftover connection keeps
    // firing events over the top of the new one.
    try { this.peer && this.peer.destroy(); } catch (_) {}
    this.peer = null;
    this.toHost = null;
    this.guests.clear();
    this.others.clear();

    try {
      const Peer = await loadPeerLibrary();
      await this._claimRoomOrJoinIt(Peer);
    } catch (err) {
      console.warn('[net] could not join the room, playing alone.', err);
      this.status = 'failed';
    } finally {
      this._joining = false;
      this._retryIn = CONFIG.NET.RETRY_SECONDS;
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
          this._silence = 0;
          console.info('[net] joined room "' + this.room + '"');
          done();
        });
        conn.on('data', (msg) => this._onRoster(msg));
        conn.on('close', () => {
          console.info('[net] lost touch with the host; will try again');
          this.toHost = null;
          this.others.clear();
          this.status = 'failed';
          this._retryIn = CONFIG.NET.RETRY_SECONDS;
        });
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
    this._silence = 0;

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
   * @param me  { x, y, angle, mode, hat, shirt, car, vehicle, name } — where
   *            we are, what we look like, and what to call us. Nothing else is
   *            ever sent.
   */
  update(dt, me) {
    // Lost touch with everybody? Try again in a moment.
    //
    // This matters more than it sounds. The room is claimed by whoever opens
    // the link first, and when they close the game or their phone locks, that
    // claim is released and everyone else is left staring at an empty town.
    // Retrying re-claims the room, so somebody else simply becomes the host
    // and the game carries on — without anyone having to reload anything.
    if (this.status === 'failed' && !this._joining) {
      this._retryIn -= dt;
      if (this._retryIn <= 0) {
        this._retryIn = CONFIG.NET.RETRY_SECONDS;
        this.join();
      }
      return;
    }

    if (this.status !== 'host' && this.status !== 'guest') return;
    this._me = me;

    // A guest that stops hearing from the host has lost it, whether or not
    // the connection ever admits as much.
    //
    // Waiting to be told is not enough: when the host's page goes away
    // abruptly — a phone locking, a tab closing — the connection often just
    // stops carrying anything, with no close event at all. That left this
    // player attached to a host that no longer existed, never retrying, and
    // unable to rejoin even once somebody else took over the room.
    if (this.status === 'guest') {
      this._silence += dt;
      if (this._silence > CONFIG.NET.SILENCE_SECONDS) {
        console.info('[net] the host has gone quiet; will try again');
        this.others.clear();
        this.status = 'failed';
        this._retryIn = CONFIG.NET.RETRY_SECONDS;
        return;
      }
    }

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
      all.push({
        id, x: p.x, y: p.y, angle: p.angle, mode: p.mode,
        hat: p.hat, shirt: p.shirt, car: p.car, vehicle: p.vehicle,
        name: p.name,
      });
    }

    const msg = { t: 'all', p: all };
    for (const conn of this.guests.values()) {
      if (conn.open) { try { conn.send(msg); } catch (_) {} }
    }
  }

  /** Hang up for good. Called when the page goes away. */
  leave() {
    try { this.peer && this.peer.destroy(); } catch (_) {}
    this.others.clear();
    this.status = 'off';     // 'off' never retries, unlike 'failed'
  }
}
