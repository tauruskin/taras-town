/**
 * main.js — canvas sizing, the one-tap start, and the game loop.
 *
 * This file holds the loop and the drawing of the world, and nothing else.
 * Taras Town's main.js reached 1800 lines by becoming the place anything went
 * when it had no obvious home; that is a cost being paid there, not a pattern
 * to copy. Entities draw themselves and the on-screen controls live in ui.js.
 */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cssW = 0, cssH = 0;   // the canvas in CSS pixels

function resize() {
  // Capped: a 4x device pixel ratio quadruples the pixels drawn for a
  // difference nobody can see on a phone held at arm's length.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  // Fullscreen is a bonus, never a requirement: a browser that refuses must
  // still give a playable game.
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
});

document.getElementById('hub-button').addEventListener('click', () => {
  window.location.href = '../../index.html';
});

function frame() {
  ctx.fillStyle = '#4FC3F7';
  ctx.fillRect(0, 0, cssW, cssH);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
