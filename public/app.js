const $ = (sel) => document.querySelector(sel);
const form = $('#lesson-form');
const statusEl = $('#status');
const phrasesEl = $('#phrases');
const audioCache = new Map(); // "speed|text" -> url
let lesson = null;
let playAllToken = 0;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  setStatus('Claude is writing your lesson…');
  try {
    lesson = await api('/api/lesson', Object.fromEntries(new FormData(form)));
    render(lesson);
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

function render({ title, phrases }) {
  $('#lesson-title').textContent = title;
  phrasesEl.replaceChildren(
    ...phrases.map((p, i) => {
      const li = document.createElement('li');
      li.className = 'phrase';
      li.innerHTML = `
        <button class="play" type="button" aria-label="Play">▶</button>
        <div class="body">
          <div class="text"></div>
          ${p.alt_script && p.alt_script !== p.text ? '<div class="alt"></div>' : ''}
          ${p.romanization ? '<div class="roman"></div>' : ''}
          <div class="translation"></div>
          ${p.note ? '<div class="note"></div>' : ''}
        </div>`;
      // textContent, not innerHTML, for model output
      li.querySelector('.text').textContent = p.text;
      li.querySelector('.alt')?.append(p.alt_script);
      li.querySelector('.roman')?.append(p.romanization);
      li.querySelector('.translation').textContent = p.translation;
      li.querySelector('.note')?.append(p.note);
      li.querySelector('.play').addEventListener('click', () => {
        playAllToken++; // cancel any running "play all"
        play(i);
      });
      return li;
    })
  );
  $('#lesson').hidden = false;
}

async function audioUrl(text) {
  const speed = $('#slow').checked ? 0.75 : 1;
  const key = `${speed}|${text}`;
  if (!audioCache.has(key)) {
    const { url } = await api('/api/tts', { text, speed });
    audioCache.set(key, url);
  }
  return audioCache.get(key);
}

let current = null;
async function play(i) {
  const li = phrasesEl.children[i];
  li.classList.add('loading');
  try {
    const url = await audioUrl(lesson.phrases[i].text);
    current?.pause();
    const audio = (current = new Audio(url));
    document.querySelectorAll('.phrase.playing').forEach((el) => el.classList.remove('playing'));
    li.classList.add('playing');
    const done = new Promise((resolve) => {
      audio.onended = resolve;
      audio.onpause = resolve;
    });
    await audio.play();
    await done;
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    li.classList.remove('loading', 'playing');
  }
}

$('#play-all').addEventListener('click', async () => {
  const token = ++playAllToken;
  for (let i = 0; i < lesson.phrases.length; i++) {
    if (token !== playAllToken) return;
    await play(i);
    await new Promise((r) => setTimeout(r, 1500)); // time to repeat out loud
  }
});

$('#show-translation').addEventListener('change', (e) => {
  document.body.classList.toggle('hide-translation', !e.target.checked);
});
