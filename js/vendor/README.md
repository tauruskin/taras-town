# Vendored third-party code

## peerjs.min.js — PeerJS 1.5.5, MIT licence

<https://github.com/peerjs/peerjs>

The only third-party code in this project. It handles WebRTC, which is what
lets two phones on the same wifi talk directly to each other.

It is **checked in rather than loaded from a CDN**, so that what is in this
repository is still exactly what gets served, and so the game cannot break
because somebody else's server changed.

It is also **only downloaded when a `?room=` is in the address**. Playing on
your own never fetches, parses or runs any of it.

To update: download `dist/peerjs.min.js` for the version you want from
<https://unpkg.com/peerjs@VERSION/dist/peerjs.min.js> and replace this file.
Nothing else needs changing — `js/net.js` only uses `window.Peer`.
