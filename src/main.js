import { createGarden } from './world.js';
import { connectTide } from './tide.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const projects = [...document.querySelectorAll('#project-list li')].map((li) => {
  const link = li.firstElementChild;
  return { name: link.querySelector('strong').textContent, subtitle: link.querySelector('small').textContent, url: link.getAttribute('href'), color: link.dataset.color, logo: link.dataset.logo };
});
let audio;
let garden;
let tide;

function chime(index = 0, soft = false) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio || document.hidden) return;
  audio ??= new Audio();
  audio.resume().catch(() => {});
  const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  for (let i = 0; i < (soft ? 1 : 3); i++) {
    const start = audio.currentTime + i * .065;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(notes[(index + i * 2) % notes.length], start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(soft ? .012 : .022, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .65);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + .7);
  }
}

function showLinks() {
  $('garden').hidden = true;
  $('project-list').hidden = false;
  garden?.setActive(false);
}

try {
  await document.fonts.load('24px "Geist Pixel"');
  $('garden').hidden = false;
  garden = await createGarden($('world'), projects, {
    select(index) {
      chime(index);
      window.open(projects[index].url, '_blank', 'noopener,noreferrer');
    },
    step: () => chime(Math.floor(Math.random() * 6), true),
    bottle: index => tide?.open(index),
    reduced: reduced.matches,
  });
  $('project-list').hidden = true;
  garden.setActive(true);
  tide = connectTide(garden, chime);
  reduced.addEventListener('change', (event) => garden.setReduced(event.matches));
  document.addEventListener('visibilitychange', () => {
    garden.setActive(!document.hidden && !$('garden').hidden);
    if (document.hidden) audio?.suspend();
  });
  $('world').addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showLinks();
  });
  window.addEventListener('pagehide', () => { garden.setActive(false); audio?.suspend(); });
  window.addEventListener('pageshow', () => garden.setActive(!$('garden').hidden));
} catch (error) {
  console.warn('The garden is unavailable. Project links remain available.', error);
  showLinks();
}
