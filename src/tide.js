export function connectTide(garden, chime) {
  const $ = id => document.getElementById(id);
  const id = crypto.randomUUID();
  const dialog = $('bottle-dialog');
  let notes = [], dreams = [], previous, timer, busy = false, lastRequest = 0, lastActive = Date.now(), requestVersion = 0;
  let noteId = crypto.randomUUID();
  let stopped = false, failures = 0, syncing = false, dreamCheck = 0;

  async function request(data) {
    // Share one request lane so saving a bottle doesn't race a presence heartbeat.
    while (busy || Date.now() - lastRequest < 1100) await new Promise(resolve => setTimeout(resolve, 100));
    busy = true; lastRequest = Date.now();
    try {
      const response = await fetch('/api/tide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, id }), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The shore is unavailable.');
      return result;
    } finally { busy = false; }
  }

  async function sync() {
    clearTimeout(timer);
    if (syncing || stopped || document.hidden || Date.now() - lastActive > 120000) return;
    syncing = true;
    try {
      const data = await request({ action: 'sync', ...garden.position() });
      garden.setVisitors(data.people); notes = data.notes; dreams = data.dreams; failures = 0;
      if (Date.now() - dreamCheck > 3600000 && Date.now() - (dreams.at(-1)?.at || 0) > 3600000) {
        dreamCheck = Date.now();
        request({ action: 'dream' }).then(data => { if (data.dream) dreams = [...dreams.filter(d => d.id !== data.dream.id), data.dream]; }).catch(error => console.warn('Free daydream:', error.message));
      }
    } catch (error) {
      garden.setVisitors([]); failures++;
      if (failures === 1) console.warn('Shared shore:', error.message);
    }
    syncing = false;
    if (!stopped && !document.hidden) timer = setTimeout(sync, failures ? Math.min(60000, 10000 * failures) : 5000);
  }

  function show() {
    lastActive = Date.now();
    if (!dialog.open) dialog.showModal();
    $('bottle-status').textContent = '';
  }
  function write() {
    requestVersion++; show();
    $('bottle-title').textContent = 'A note for someone';
    $('bottle-message').hidden = true; $('bottle-actions').hidden = true; $('note-form').hidden = false;
    $('note-text').focus();
  }
  async function read() {
    const version = ++requestVersion; show();
    $('bottle-message').hidden = false; $('bottle-actions').hidden = false; $('note-form').hidden = true;
    $('bottle-title').textContent = 'A bottle from the tide';
    $('bottle-message').textContent = 'Listening to the sea…';
    $('another-bottle').disabled = true;
    try {
      const pool = [...notes.map(note => ({ ...note, kind: 'A visitor left this' })), ...dreams.map(note => ({ ...note, kind: 'A daydream · AI' }))];
      let choices = pool.filter(note => note.id !== previous);
      if (!choices.length) choices = pool;
      let chosen = choices[Math.floor(Math.random() * choices.length)];
      if (!chosen) {
        const data = await request({ action: 'dream' });
        if (!data.dream) throw new Error('The tide is quiet. Leave the first note.');
        dreams.push(data.dream); chosen = { ...data.dream, kind: 'A daydream · AI' };
      }
      if (version !== requestVersion || !dialog.open) return;
      previous = chosen.id;
      $('bottle-title').textContent = chosen.kind;
      $('bottle-message').textContent = chosen.text;
      chime(3, true);
    } catch (error) {
      if (version === requestVersion && dialog.open) $('bottle-message').textContent = error.message;
    } finally { if (version === requestVersion) $('another-bottle').disabled = false; }
  }
  $('another-bottle').addEventListener('click', read);
  $('write-note').addEventListener('click', write);
  $('note-form').addEventListener('submit', async event => {
    event.preventDefault();
    const version = ++requestVersion, text = $('note-text').value;
    const button = event.submitter;
    button.disabled = true; $('bottle-status').textContent = 'Sending…';
    try {
      await request({ action: 'note', noteId, text });
      notes.push({ id: noteId, text, at: Date.now() }); noteId = crypto.randomUUID();
      $('note-text').value = '';
      if (version === requestVersion && dialog.open) {
        $('bottle-title').textContent = 'Set afloat'; $('bottle-message').textContent = text;
        $('bottle-message').hidden = false; $('note-form').hidden = true; $('bottle-actions').hidden = false; $('bottle-status').textContent = '';
        chime(4);
      }
    } catch (error) { if (version === requestVersion && dialog.open) $('bottle-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('close', () => { requestVersion++; $('another-bottle').disabled = false; });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  function wake() {
    const asleep = Date.now() - lastActive > 120000;
    lastActive = Date.now(); if (asleep) sync();
  }
  document.addEventListener('pointerdown', wake);
  document.addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) { lastActive = Date.now(); sync(); } });
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); });
  window.addEventListener('pageshow', () => { if (stopped) { stopped = false; sync(); } });
  sync();
  return { open(index) { if (index) write(); else read(); } };
}
