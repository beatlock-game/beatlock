// ===== Pengaturan: cukup isi dua nilai ini =====
// Link halaman itch.io. Saat diisi, label "Coming soon" di hero dan footer otomatis diganti link download.
const ITCH_URL = '';
// URL layanan form (mis. Formspree). Selama kosong, pendaftaran hanya tersimpan di browser pengunjung (mode demo).
const FORM_ENDPOINT = 'https://formspree.io/f/mqpqennv';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== Menu HP =====
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.getElementById('nav-menu');

function setMenu(open) {
  navMenu.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open);
  navToggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
}

navToggle.addEventListener('click', () => setMenu(!navMenu.classList.contains('open')));
navMenu.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navMenu.classList.contains('open')) {
    setMenu(false);
    navToggle.focus();
  }
});

// ===== Link itch.io =====
if (ITCH_URL) {
  document.querySelectorAll('[data-itch-label]').forEach((el) => (el.hidden = true));
  document.querySelectorAll('[data-itch-link]').forEach((el) => {
    el.href = ITCH_URL;
    el.hidden = false;
  });
}

// ===== Tombol Listen =====
// Keempat stem diputar bersamaan sejak klik pertama dengan volume 0; Listen hanya menaikkan volume role itu.
// Dengan begitu stem tetap sejalan. stem_backing (bass) ikut berbunyi selama ada role yang menyala.
const STEMS = ['backing', 'beat', 'harmony', 'lead'];
const STEP = 0.15; // Seperenam belas ketukan pada 100 BPM.
const TRAVEL = 0.75; // Detik note jatuh, sama dengan animasi .hit di CSS.

// Pola note di kartu hanya hiasan, bukan chart asli dari game. Tiap hit: [langkah, lane].
const PATTERNS = {
  beat: { length: 16, hits: [[0, 0], [2, 2], [4, 1], [6, 2], [8, 0], [10, 0], [10, 2], [12, 1], [14, 2], [15, 3]] },
  harmony: { length: 16, hits: [[0, 0], [4, 1], [8, 2], [12, 1]] },
  lead: { length: 32, hits: [[0, 2], [3, 3], [6, 4], [8, 1], [10, 2], [12, 0], [16, 3], [19, 2], [22, 1], [24, 4], [28, 2], [30, 3]] },
};

const listenButtons = document.querySelectorAll('.listen');
const bandHint = document.getElementById('band-hint');
const songPlayer = document.getElementById('song-player');
const active = new Set();
const gains = {};
const downloads = {}; // nama stem -> Promise<ArrayBuffer>
const stems = {}; // nama stem -> Promise yang selesai saat stem sudah berputar
let ctx, startAt, timer;
let visualStep = 0;

function download(name) {
  downloads[name] ??= fetch(`assets/audio/stem_${name}.mp3`).then((res) => {
    if (!res.ok) throw new Error(`stem_${name}: ${res.status}`);
    return res.arrayBuffer();
  });
  return downloads[name];
}

// Unduh stem lebih awal saat bagian Role hampir terlihat, supaya klik Listen tidak menunggu lama.
const rolesSection = document.getElementById('roles');
if ('IntersectionObserver' in window && rolesSection) {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      STEMS.forEach((name) => download(name).catch(() => {}));
    }
  }, { rootMargin: '800px 0px' });
  observer.observe(rolesSection);
}

// Tiap stem mulai berputar begitu siap. Stem yang telat masuk di posisi yang sama dengan stem lain, jadi tetap sejalan.
function playStem(name) {
  stems[name] ??= (async () => {
    const buffer = await ctx.decodeAudioData((await download(name)).slice(0));
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain).connect(ctx.destination);
    const when = ctx.currentTime + 0.05;
    startAt ??= when;
    src.start(when, (when - startAt) % buffer.duration);
    gains[name] = gain;
  })().catch((err) => {
    delete stems[name];
    delete downloads[name];
    throw err;
  });
  return stems[name];
}

function setRole(role, on) {
  if (on) active.add(role);
  else active.delete(role);
  if (!ctx || !gains[role]) return;
  gains[role].gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
  gains.backing.gain.setTargetAtTime(active.size ? 1 : 0, ctx.currentTime, 0.05);
}

function dropNote(role, lane, delay) {
  const note = document.createElement('span');
  note.className = 'hit';
  note.style.animationDelay = `${delay}s`;
  note.addEventListener('animationend', () => note.remove());
  document.querySelector(`.role-card[data-role="${role}"] .lanes`).children[lane].append(note);
}

// Note dibuat TRAVEL detik lebih awal supaya mendarat di garis tepat pada ketukannya.
function tick() {
  const now = ctx.currentTime;
  while (startAt + visualStep * STEP < now + TRAVEL) {
    const delay = startAt + visualStep * STEP - TRAVEL - now;
    active.forEach((role) => {
      const { length, hits } = PATTERNS[role];
      hits.filter((hit) => hit[0] === visualStep % length).forEach((hit) => dropNote(role, hit[1], delay));
    });
    visualStep++;
  }
}

function clearNotes(role) {
  const scope = role ? `.role-card[data-role="${role}"] ` : '';
  document.querySelectorAll(`${scope}.hit`).forEach((note) => note.remove());
}

function updateBand() {
  listenButtons.forEach((btn) => {
    const on = active.has(btn.dataset.role);
    btn.setAttribute('aria-pressed', on);
    btn.textContent = on ? '■ Stop' : '▶ Listen';
    btn.closest('.role-card').classList.toggle('playing', on);
  });
  const locked = active.size === listenButtons.length;
  bandHint.className = locked ? 'band-hint locked' : 'band-hint';
  bandHint.textContent = locked
    ? 'Itu dia bandnya: BEAT, HARMONY, dan LEAD terkunci di satu ketukan.'
    : 'Nyalakan Listen di ketiga kartu untuk mendengar band lengkap.';

  if (active.size && !timer && !reduceMotion) {
    visualStep = Math.max(0, Math.ceil((ctx.currentTime - startAt) / STEP));
    timer = setInterval(tick, 25);
    tick();
  } else if (!active.size && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function stopBand() {
  [...active].forEach((role) => setRole(role, false));
  clearNotes();
  updateBand();
}

listenButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const role = btn.dataset.role;
    const turnOn = !active.has(role);
    if (turnOn) {
      ctx ??= new AudioContext();
      ctx.resume(); // Dipanggil langsung di dalam klik agar browser mengizinkan suara.
      const ready = Promise.all([playStem('backing'), playStem(role)]);
      if (!gains[role] || !gains.backing) {
        btn.disabled = true;
        btn.textContent = 'Memuat…';
      }
      try {
        await ready;
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        updateBand();
        bandHint.className = 'band-hint error';
        bandHint.textContent = 'Audio gagal dimuat. Coba tekan Listen lagi.';
        return;
      }
      btn.disabled = false;
      // Siapkan stem lain di belakang layar untuk klik berikutnya.
      STEMS.forEach((name) => playStem(name).catch(() => {}));
    }
    if (turnOn) songPlayer.pause();
    setRole(role, turnOn);
    if (!turnOn) clearNotes(role);
    updateBand();
  });
});

// Jangan tumpang tindih dengan cuplikan lagu.
songPlayer.addEventListener('play', stopBand);

// Timer melambat di tab latar, jadi band dimatikan saat tab ditinggalkan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && active.size) stopBand();
});

// ===== Form daftar beta =====
const form = document.getElementById('beta-form');
const formStatus = document.getElementById('form-status');
const submitBtn = form.querySelector('button[type=submit]');

document.querySelectorAll('[data-pick]').forEach((link) => {
  link.addEventListener('click', () => {
    form.querySelector(`input[value="${link.dataset.pick}"]`).checked = true;
  });
});

function showStatus(text, isError) {
  formStatus.className = isError ? 'form-status error' : 'form-status';
  formStatus.textContent = text;
}

function saveLocally(entry) {
  try {
    const saved = JSON.parse(localStorage.getItem('beatlock-signups') || '[]');
    saved.push(entry);
    localStorage.setItem('beatlock-signups', JSON.stringify(saved));
  } catch (err) {
    console.warn('Pendaftaran tidak bisa disimpan di browser', err);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const role = data.get('role');
  const email = form.elements.email;

  if (!role) return showStatus('Pilih role favoritmu dulu.', true);
  if (!email.checkValidity()) {
    email.focus();
    return showStatus('Masukkan alamat email yang valid.', true);
  }

  showStatus('', false);
  submitBtn.disabled = true;
  try {
    if (FORM_ENDPOINT) {
      const res = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
      if (!res.ok) throw new Error(`Pendaftaran gagal: ${res.status}`);
      showStatus(`Kamu masuk daftar sebagai ${role}.`, false);
    } else {
      saveLocally({ email: data.get('email'), role, at: new Date().toISOString() });
      showStatus(`Kamu masuk daftar sebagai ${role}. (Demo: tersimpan di browser ini saja.)`, false);
    }
    form.reset();
  } catch (err) {
    console.error(err);
    showStatus('Pendaftaran gagal, coba lagi.', true);
  } finally {
    submitBtn.disabled = false;
  }
});
