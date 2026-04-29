(() => {
  'use strict';

  const DATA = window.FAITH_DATA;
  const STORAGE_KEY = 'faith_os_xp_state_v1';
  const APP_IDS = Object.keys(DATA.apps);
  const templates = {
    letter: 'tpl-letter',
    tosha: 'tpl-tosha',
    messenger: 'tpl-messenger',
    stars: 'tpl-stars',
    twims: 'tpl-twims',
    cmd: 'tpl-cmd',
    player: 'tpl-player',
    photos: 'tpl-photos',
    dreams: 'tpl-dreams',
    coupon: 'tpl-coupon',
    bin: 'tpl-bin'
  };

  const state = loadState();
  const els = {};
  let zIndex = 20;
  let audioCtx = null;
  let twimsTimer = null;
  let fxCtx = null;
  let fxParticles = [];

  function defaultState() {
    return {
      opened: [],
      sound: false,
      windows: {},
      letterTyped: false,
      toshaLove: 0,
      chatUsed: [],
      stars: [],
      twimsScore: 0,
      coupon: '',
      binEmpty: false,
      wallpaper: 'default',
      playerIndex: 0,
      finalCrashSeen: false
    };
  }

  function loadState() {
    try {
      if (new URLSearchParams(location.search).get('reset') === '1') {
        localStorage.removeItem(STORAGE_KEY);
        try { history.replaceState(null, '', location.pathname); } catch (err) {}
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (err) {
      return defaultState();
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) {}
  }

  function $(id) { return document.getElementById(id); }

  function init() {
    els.desktop = $('desktop');
    els.windowArea = $('windowArea');
    els.taskList = $('taskList');
    els.startMenu = $('startMenu');
    els.doneCount = $('doneCount');
    els.totalCount = $('totalCount');
    els.globalBar = $('globalBar');
    els.globalHint = $('globalHint');
    els.clock = $('clock');
    els.fxCanvas = $('fxCanvas');
    state.windows = {};
    saveState();
    setupBoot();
    setupCanvas();
    setupDesktopIcons();
    setupTaskbar();
    applyWallpaper();
    updateClock();
    setInterval(updateClock, 1000);
    updateProgress();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function setupBoot() {
    const boot = $('boot');
    const progress = $('bootProgress');
    const line = $('bootLine');
    let i = 0;
    const tick = () => {
      i += 1;
      progress.style.width = `${Math.min(100, i * 20)}%`;
      line.textContent = DATA.bootLines[(i - 1) % DATA.bootLines.length];
      if (i >= 5) setTimeout(() => boot.classList.add('is-hidden'), 350);
      else setTimeout(tick, 420);
    };
    $('skipBoot').addEventListener('click', () => boot.classList.add('is-hidden'));
    setTimeout(tick, 350);
  }

  function setupDesktopIcons() {
    document.querySelectorAll('[data-open]').forEach((node) => {
      node.addEventListener('click', (event) => {
        const id = node.dataset.open;
        if (node.classList.contains('desktop-icon')) {
          document.querySelectorAll('.desktop-icon').forEach((el) => el.classList.remove('is-selected'));
          node.classList.add('is-selected');
        }
        openApp(id);
        els.startMenu.classList.remove('is-open');
        event.stopPropagation();
      });
    });
    els.desktop.addEventListener('click', () => {
      document.querySelectorAll('.desktop-icon').forEach((el) => el.classList.remove('is-selected'));
      els.startMenu.classList.remove('is-open');
    });
  }

  function setupTaskbar() {
    $('startButton').addEventListener('click', (event) => {
      els.startMenu.classList.toggle('is-open');
      playTone(420, 0.04);
      event.stopPropagation();
    });
    $('soundToggle').addEventListener('click', () => {
      state.sound = !state.sound;
      saveState();
      $('soundToggle').textContent = state.sound ? '🔊' : '🔈';
      $('soundToggle').setAttribute('aria-pressed', String(state.sound));
      playTone(660, 0.07);
    });
    $('soundToggle').textContent = state.sound ? '🔊' : '🔈';
    document.querySelectorAll('[data-action="reset"]').forEach((btn) => btn.addEventListener('click', resetState));
    document.querySelectorAll('[data-action="shutdown"]').forEach((btn) => btn.addEventListener('click', () => $('shutdown').classList.add('is-open')));
    $('wakeAgain').addEventListener('click', () => $('shutdown').classList.remove('is-open'));
    $('finalReboot').addEventListener('click', () => $('finalError').classList.remove('is-open', 'is-404'));
  }

  function updateClock() {
    const now = new Date();
    els.clock.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function openApp(id) {
    const cfg = DATA.apps[id];
    if (!cfg) return;
    const existing = state.windows[id] && $(state.windows[id]);
    if (existing) {
      existing.classList.remove('is-minimized');
      focusWindow(existing);
      updateTaskButtons();
      return;
    }

    const win = document.createElement('section');
    const winId = `win-${id}-${Date.now()}`;
    win.id = winId;
    win.className = 'xp-window';
    win.dataset.app = id;
    win.style.width = `${Math.min(cfg.w, window.innerWidth - 28)}px`;
    win.style.height = `${Math.min(cfg.h, window.innerHeight - 80)}px`;
    const offset = Object.keys(state.windows).length * 24;
    win.style.left = `${Math.max(8, Math.min(170 + offset, window.innerWidth - 340))}px`;
    win.style.top = `${Math.max(8, Math.min(60 + offset, window.innerHeight - 260))}px`;
    win.innerHTML = windowShell(cfg, id);
    const tpl = $(templates[id]);
    if (tpl) win.querySelector('.window-body').appendChild(tpl.content.cloneNode(true));
    els.windowArea.appendChild(win);
    state.windows[id] = winId;
    markOpened(id);
    focusWindow(win);
    makeDraggable(win);
    bindWindowControls(win);
    bindApp(id, win);
    updateTaskButtons();
    saveState();
    playTone(520, 0.05);
  }

  function windowShell(cfg, id) {
    return `<div class="xp-titlebar"><div class="xp-title"><span>${cfg.icon}</span><span>${cfg.title}</span></div><div class="window-controls"><button data-window="min" type="button">_</button><button data-window="max" type="button">□</button><button class="close" data-window="close" type="button">×</button></div></div><div class="window-body"></div>`;
  }

  function bindWindowControls(win) {
    win.addEventListener('pointerdown', () => focusWindow(win));
    win.querySelector('[data-window="close"]').addEventListener('click', () => closeWindow(win));
    win.querySelector('[data-window="min"]').addEventListener('click', () => {
      win.classList.add('is-minimized');
      updateTaskButtons();
      playTone(300, 0.04);
    });
    win.querySelector('[data-window="max"]').addEventListener('click', () => {
      const maxed = win.classList.toggle('is-maxed');
      if (maxed) {
        win.dataset.old = JSON.stringify({ left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height });
        win.style.left = '8px';
        win.style.top = '8px';
        win.style.width = 'calc(100vw - 16px)';
        win.style.height = 'calc(100vh - 60px)';
      } else if (win.dataset.old) {
        const old = JSON.parse(win.dataset.old);
        Object.assign(win.style, old);
      }
    });
  }

  function closeWindow(win) {
    const id = win.dataset.app;
    if (id === 'twims') stopTwims();
    if (id === 'player') win.querySelector('audio')?.pause();
    delete state.windows[id];
    win.remove();
    updateTaskButtons();
    saveState();
    playTone(240, 0.05);
  }

  function focusWindow(win) {
    document.querySelectorAll('.xp-window').forEach((w) => w.classList.remove('is-active'));
    win.classList.add('is-active');
    win.style.zIndex = String(++zIndex);
    updateTaskButtons(win.dataset.app);
  }

  function makeDraggable(win) {
    const bar = win.querySelector('.xp-titlebar');
    let dragging = false, startX = 0, startY = 0, left = 0, top = 0;
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      left = parseFloat(win.style.left) || 0;
      top = parseFloat(win.style.top) || 0;
      bar.setPointerCapture?.(event.pointerId);
      focusWindow(win);
    });
    window.addEventListener('pointermove', (event) => {
      if (!dragging || win.classList.contains('is-maxed')) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 80, left + event.clientX - startX));
      const ny = Math.max(0, Math.min(window.innerHeight - 70, top + event.clientY - startY));
      win.style.left = `${nx}px`;
      win.style.top = `${ny}px`;
    });
    window.addEventListener('pointerup', () => { dragging = false; });
  }

  function updateTaskButtons(activeId) {
    els.taskList.innerHTML = '';
    Object.entries(state.windows).forEach(([app, winId]) => {
      const win = $(winId);
      if (!win) return;
      const cfg = DATA.apps[app];
      const btn = document.createElement('button');
      btn.className = `task-btn${app === activeId ? ' is-active' : ''}`;
      btn.type = 'button';
      btn.textContent = `${cfg.icon} ${cfg.title}`;
      btn.addEventListener('click', () => {
        if (win.classList.contains('is-minimized')) win.classList.remove('is-minimized');
        else if (win.classList.contains('is-active')) win.classList.add('is-minimized');
        focusWindow(win);
        updateTaskButtons(app);
      });
      els.taskList.appendChild(btn);
    });
  }

  function markOpened(id) {
    if (!state.opened.includes(id)) {
      state.opened.push(id);
      confetti(5, Math.random() * innerWidth, 120, ['⭐','🎀','💛']);
      updateProgress();
      maybeShowFinalError();
    }
  }

  function updateProgress() {
    const total = APP_IDS.length;
    const done = state.opened.length;
    els.totalCount.textContent = String(total);
    els.doneCount.textContent = String(done);
    els.globalBar.style.width = `${Math.round(done / total * 100)}%`;
    els.globalHint.textContent = done >= total ? 'все окна нашли своё место' : done >= 6 ? 'финальные штуки уже рядом' : 'можно просто тыкать ярлыки';
  }

  function maybeShowFinalError() {
    if (state.finalCrashSeen || state.opened.length < APP_IDS.length) return;
    state.finalCrashSeen = true;
    saveState();
    setTimeout(showFinalError, 650);
  }

  function showFinalError() {
    const overlay = $('finalError');
    const count = $('finalCountdown');
    const line = $('finalErrorLine');
    const lines = [
      'система пытается обработать уровень милоты...',
      'проверка: принцесса обнаружена',
      'результат: слишком красивая'
    ];
    let value = 3;
    overlay.classList.add('is-open');
    overlay.classList.remove('is-404');
    count.textContent = String(value);
    line.textContent = lines[0];
    playTone(220, 0.08, 'square');
    const timer = setInterval(() => {
      value -= 1;
      count.textContent = String(Math.max(0, value));
      line.textContent = lines[Math.min(lines.length - 1, 3 - value)];
      playTone(180 + value * 80, 0.06, 'square');
      if (value <= 0) {
        clearInterval(timer);
        overlay.classList.add('is-404');
        line.textContent = 'ошибка не исправлена, потому что это не ошибка';
        confetti(20, innerWidth / 2, innerHeight / 2, ['💛','🎀','⭐']);
      }
    }, 1000);
  }

  function bindApp(id, win) {
    const map = { letter: bindLetter, tosha: bindTosha, messenger: bindMessenger, stars: bindStars, twims: bindTwims, cmd: bindCmd, player: bindPlayer, photos: bindPhotos, dreams: bindDreams, coupon: bindCoupon, bin: bindBin };
    map[id]?.(win);
  }

  function bindLetter(win) {
    const target = win.querySelector('#letterText');
    const btn = win.querySelector('#typeLetter');
    if (state.letterTyped) target.textContent = DATA.letter;
    btn.addEventListener('click', () => typeText(target, DATA.letter, 12, () => { state.letterTyped = true; saveState(); }));
  }

  function bindTosha(win) {
    const cat = win.querySelector('#toshaCat');
    const line = win.querySelector('#toshaLine');
    const meter = win.querySelector('#toshaMeter');
    const bubbles = win.querySelector('#toshaBubbles');
    const render = () => { meter.style.width = `${Math.min(100, state.toshaLove * 10)}%`; };
    const pet = (emoji = '💛', boost = 1, customLine = '') => {
      state.toshaLove = Math.min(10, state.toshaLove + boost);
      line.textContent = DATA.toshaLines[(state.toshaLove - 1) % DATA.toshaLines.length];
      if (customLine) line.textContent = customLine;
      const bubble = document.createElement('span');
      bubble.className = 'bubble-pop';
      bubble.textContent = emoji;
      bubble.style.left = `${38 + Math.random() * 28}%`;
      bubble.style.top = `${50 + Math.random() * 20}%`;
      bubbles.appendChild(bubble);
      setTimeout(() => bubble.remove(), 1300);
      render(); saveState(); playTone(760, 0.04); confetti(2, cat.getBoundingClientRect().left + 50, cat.getBoundingClientRect().top, ['🐾','💛']);
    };
    cat.addEventListener('click', () => pet('💛'));
    const actions = {
      pet: ['💛', 1, 'Тошик получил поглаживание и сделал вид, что он вообще-то главный.'],
      feed: ['🥣', 2, 'Вкусняшка принята. Тошик стал добрее к этому дню.'],
      warm: ['🔥', 1, 'Печка теплее, Тошик доволен, уют держится стабильно.'],
      comb: ['🐾', 1, 'За ушком почесали идеально. Тошик моргнул медленно.'],
      guard: ['🛡️', 2, 'Тошик встал на охрану спокойствия. Подозрительные мысли не проходят.'],
      sleep: ['🌙', 1, 'Тошик уснул на печке. Режим спатки включён.']
    };
    win.querySelectorAll('[data-tosha]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [emoji, boost, text] = actions[btn.dataset.tosha] || actions.pet;
        pet(emoji, boost, text);
        if (btn.dataset.tosha === 'sleep') confetti(8, innerWidth / 2, innerHeight / 2, ['🌙','⭐']);
      });
    });
    render();
  }

  function bindMessenger(win) {
    const log = win.querySelector('#chatLog');
    const replies = win.querySelector('#quickReplies');
    function append(side, text) {
      const msg = document.createElement('div');
      msg.className = `msg ${side}`;
      msg.textContent = text;
      log.appendChild(msg);
      log.scrollTop = log.scrollHeight;
    }
    append('her', 'Можно открыть любой маленький диалог. Тут без давления.');
    DATA.chatThreads.forEach((thread) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = thread.label;
      if (state.chatUsed.includes(thread.key)) btn.disabled = true;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        if (!state.chatUsed.includes(thread.key)) state.chatUsed.push(thread.key);
        let delay = 0;
        thread.messages.forEach(([side, text]) => {
          setTimeout(() => { append(side, text); playTone(side === 'me' ? 520 : 640, 0.035); }, delay);
          delay += 420;
        });
        saveState();
      });
      replies.appendChild(btn);
    });
  }

  function bindStars(win) {
    const zone = win.querySelector('#starsZone');
    const jar = win.querySelector('#starJar');
    const num = win.querySelector('#jarNum');
    const line = win.querySelector('#starsLine');
    const reward = win.querySelector('#starReward');
    const render = () => {
      num.textContent = String(state.stars.length);
      if (state.stars.length >= 8) {
        reward.classList.add('is-open');
        reward.innerHTML = '<b>награда разблокирована</b><span>маленький запас света на обычные дни</span>';
      }
    };
    function capture(star) {
      const id = star.dataset.star;
      if (state.stars.includes(id)) return;
      state.stars.push(id);
      star.remove();
      line.textContent = state.stars.length >= 8 ? 'Баночка собрана. Это запас света для обычных дней.' : `Поймано ${state.stars.length} из 8.`;
      render(); saveState(); playTone(880, .05); confetti(3, jar.getBoundingClientRect().left + 70, jar.getBoundingClientRect().top + 80, ['⭐','✦']);
      if (state.stars.length >= 8) confetti(24, jar.getBoundingClientRect().left + 80, jar.getBoundingClientRect().top + 40, ['⭐','🎀','💛','✦']);
    }
    for (let i = 0; i < 8; i++) {
      const id = String(i);
      if (state.stars.includes(id)) continue;
      const star = document.createElement('button');
      star.className = 'star'; star.type = 'button'; star.dataset.star = id; star.setAttribute('aria-label', 'звезда');
      star.style.left = `${10 + Math.random() * 78}%`; star.style.top = `${10 + Math.random() * 76}%`;
      makeStarDraggable(star, zone, jar, () => capture(star));
      star.addEventListener('click', () => capture(star));
      zone.appendChild(star);
    }
    render();
  }

  function makeStarDraggable(star, zone, jar, onCapture) {
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    star.addEventListener('pointerdown', (event) => {
      drag = true; sx = event.clientX; sy = event.clientY; ox = star.offsetLeft; oy = star.offsetTop; star.setPointerCapture?.(event.pointerId);
    });
    window.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const rect = zone.getBoundingClientRect();
      star.style.left = `${Math.max(0, Math.min(rect.width - 34, ox + event.clientX - sx))}px`;
      star.style.top = `${Math.max(0, Math.min(rect.height - 34, oy + event.clientY - sy))}px`;
    });
    window.addEventListener('pointerup', (event) => {
      if (!drag) return; drag = false;
      const r = jar.getBoundingClientRect();
      if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) onCapture();
    });
  }

  function bindTwims(win) {
    const field = win.querySelector('#twimsField');
    const start = win.querySelector('#twimsStart');
    const score = win.querySelector('#twimsScore');
    const line = win.querySelector('#twimsLine');
    score.textContent = String(state.twimsScore);
    start.addEventListener('click', () => {
      if (twimsTimer) { stopTwims(); start.textContent = 'старт'; return; }
      start.textContent = 'пауза'; line.textContent = 'кликай по задачкам'; spawnTask(field, score, line);
      twimsTimer = setInterval(() => spawnTask(field, score, line), 650);
    });
  }

  function stopTwims() {
    if (!twimsTimer) return;
    clearInterval(twimsTimer);
    twimsTimer = null;
  }

  function spawnTask(field, score, line) {
    if (!field.isConnected) { stopTwims(); return; }
    if (state.twimsScore >= 15) { stopTwims(); line.textContent = 'твимс нейтрализован'; return; }
    if (field.children.length > 18) return;
    const task = document.createElement('button');
    task.className = 'task'; task.type = 'button';
    task.textContent = DATA.twimsTasks[Math.floor(Math.random() * DATA.twimsTasks.length)];
    task.style.left = `${Math.random() * Math.max(40, field.clientWidth - 90)}px`;
    task.style.animationDuration = `${2.4 + Math.random() * 1.3}s`;
    task.addEventListener('click', () => {
      state.twimsScore += 1;
      score.textContent = String(state.twimsScore);
      task.remove(); saveState(); playTone(340, .04, 'square');
      if (state.twimsScore >= 15) { line.textContent = 'щит сработал. можно выдохнуть.'; confetti(12, field.getBoundingClientRect().left + field.clientWidth/2, field.getBoundingClientRect().top + 40, ['🛡️','⭐']); }
    });
    task.addEventListener('animationend', () => task.remove());
    field.appendChild(task);
  }

  function bindCmd(win) {
    const out = win.querySelector('#cmdOutput');
    const input = win.querySelector('#cmdInput');
    const write = (text) => { out.textContent += text + '\n'; out.scrollTop = out.scrollHeight; };
    write('Microsoft Windows XP [faith edition]');
    write('(C) собрана вручную. Внешних библиотек нет.');
    write('Введите help или heart.');
    input.focus();
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const cmd = input.value.trim().toLowerCase(); input.value = ''; write(`C:\\faith> ${cmd}`); runCmd(cmd, write, out);
    });
  }

  function runCmd(cmd, write, out) {
    const responses = {
      help: 'help, heart, morning, sleep, twims, tosha, letter, clear',
      morning: 'доброе утро 🎀\nпроверка: любимая принцесса найдена',
      sleep: 'спокойной ночки, лапка. режим снов активирован 🌙',
      twims: 'twims.dll отключен. shield=on',
      tosha: 'Тошик.exe уже греется на печке 🐱',
      letter: 'Файл Мои чувства.txt лежит на рабочем столе. Он важнее cmd.'
    };
    if (cmd === 'clear') { out.textContent = ''; return; }
    if (cmd === 'heart') { animateHeart(out); confetti(18, innerWidth / 2, innerHeight / 2, ['💛','🎀','⭐']); return; }
    write(responses[cmd] || `'${cmd}' не является командой, но faith OS всё равно на твоей стороне.`);
  }

  function animateHeart(out) {
    const frames = [
      ['    **   **    ', '  ****** ******  ', ' *************** ', '  *************  ', '    *********    ', '      *****      ', '        *        '],
      ['   ***   ***   ', ' ******* ******* ', '*****************', ' *************** ', '  *************  ', '    *********    ', '      *****      ', '        *        '],
      ['  ****   ****  ', '*************** ', '*****************', '*****************', ' *************** ', '   ***********   ', '     *******     ', '       ***       ', '        *        '],
      [' faith   faith ', '*************** ', '**  люблю   ** ', '*****************', ' *************** ', '   ***********   ', '     *******     ', '       ***       ', '        *        ']
    ];
    let i = 0;
    const prefix = out.textContent;
    const timer = setInterval(() => {
      out.textContent = `${prefix}${frames[i % frames.length].join('\n')}\n`;
      out.scrollTop = out.scrollHeight;
      i += 1;
      if (i > 11) clearInterval(timer);
    }, 120);
  }

  function bindPlayer(win) {
    const audio = win.querySelector('#audioPlayer');
    const title = win.querySelector('#trackTitle');
    const hint = win.querySelector('#trackHint');
    const list = win.querySelector('#playlist');
    const disc = win.querySelector('#playerDisc');
    let tracks = normalizeTracks(DATA.musicTracks || []);
    const render = () => {
      list.innerHTML = '';
      if (!tracks.length) {
        list.innerHTML = '<div class="playlist-empty">плейлист пуст</div>';
        title.textContent = 'faith Player';
        hint.textContent = 'добавь треки в assets/tracks/playlist.json';
        return;
      }
      tracks.forEach((track, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `track-row${index === state.playerIndex ? ' is-active' : ''}`;
        btn.textContent = track.name;
        btn.addEventListener('click', () => load(index, true));
        list.appendChild(btn);
      });
    };
    const load = (index, play = false) => {
      if (!tracks.length) return;
      state.playerIndex = (index + tracks.length) % tracks.length;
      const track = tracks[state.playerIndex];
      audio.src = track.src;
      title.textContent = track.name;
      hint.textContent = track.note || 'готово к воспроизведению';
      saveState();
      render();
      if (play) audio.play().catch(() => {});
    };
    win.querySelector('#prevTrack').addEventListener('click', () => load(state.playerIndex - 1, true));
    win.querySelector('#nextTrack').addEventListener('click', () => load(state.playerIndex + 1, true));
    win.querySelector('#playTrack').addEventListener('click', () => {
      if (!audio.src) load(state.playerIndex, false);
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    });
    audio.addEventListener('play', () => disc.classList.add('is-playing'));
    audio.addEventListener('pause', () => disc.classList.remove('is-playing'));
    audio.addEventListener('ended', () => load(state.playerIndex + 1, true));
    render();
    if (tracks.length) load(state.playerIndex, false);
    fetch('./assets/tracks/playlist.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((items) => {
        const loaded = normalizeTracks(items);
        if (!loaded.length) return;
        tracks = loaded;
        state.playerIndex = Math.min(state.playerIndex, tracks.length - 1);
        load(state.playerIndex, false);
      })
      .catch(() => {
        if (!tracks.length) hint.textContent = 'playlist.json пока не найден';
      });
  }

  function normalizeTracks(items) {
    return items.map((item) => {
      if (typeof item === 'string') {
        return { name: item, src: `./assets/tracks/${encodeURIComponent(item)}` };
      }
      const file = item.file || item.src || '';
      return {
        name: item.title || file,
        src: file.startsWith('./') || file.startsWith('assets/') ? file : `./assets/tracks/${encodeURIComponent(file)}`,
        note: item.note || ''
      };
    }).filter((track) => track.name && track.src);
  }

  function bindPhotos(win) {
    const img = win.querySelector('#photoView');
    win.querySelector('[data-photo="wide"]').addEventListener('click', () => img.src = './assets/couple-wide.jpg');
    win.querySelector('[data-photo="close"]').addEventListener('click', () => img.src = './assets/couple-close.jpg');
    win.querySelector('#setWallpaper').addEventListener('click', () => { state.wallpaper = img.src.includes('close') ? 'close' : 'wide'; applyWallpaper(); saveState(); confetti(10, innerWidth - 220, 150, ['🖼️','⭐']); });
  }

  function applyWallpaper() {
    const wall = document.querySelector('.wallpaper');
    if (!wall) return;
    wall.classList.toggle('has-photo', state.wallpaper !== 'default');
    wall.classList.toggle('is-close', state.wallpaper === 'close');
  }

  function bindDreams(win) {
    const canvas = win.querySelector('#dreamCanvas');
    const line = win.querySelector('#dreamLine');
    drawDream(canvas);
    win.querySelector('#nextDream').addEventListener('click', () => { line.textContent = DATA.dreamLines[Math.floor(Math.random()*DATA.dreamLines.length)]; confetti(6, win.getBoundingClientRect().left+80, win.getBoundingClientRect().top+80, ['🌙','⭐']); });
  }

  function drawDream(canvas) {
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
    resize();
    const stars = Array.from({length: 70}, () => ({x: Math.random()*canvas.clientWidth, y: Math.random()*canvas.clientHeight, r: Math.random()*2+1, v: Math.random()*.35+.05}));
    const tick = () => { if (!canvas.isConnected) return; ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); ctx.fillStyle='rgba(255,255,255,.85)'; stars.forEach(s=>{ s.y += s.v; if(s.y>canvas.clientHeight) s.y=0; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); }); requestAnimationFrame(tick); };
    tick();
  }

  function bindCoupon(win) {
    const options = win.querySelector('#couponOptions');
    const text = win.querySelector('#couponText');
    const paper = win.querySelector('#couponPaper');
    DATA.coupons.forEach(([title, body]) => {
      const btn = document.createElement('button'); btn.className = 'xp-button'; btn.type = 'button'; btn.textContent = title;
      btn.addEventListener('click', () => { state.coupon = `${title}\n\n${body}`; text.textContent = body; paper.textContent = state.coupon; saveState(); });
      options.appendChild(btn);
    });
    if (state.coupon) paper.textContent = state.coupon;
    win.querySelector('#printCoupon').addEventListener('click', () => { paper.textContent = (state.coupon || 'любой хороший вечер\n\nМожно выбрать формат позже.') + '\n\n[printed by faith OS]'; confetti(12, win.getBoundingClientRect().left+260, win.getBoundingClientRect().top+160, ['🎫','💛']); });
  }

  function bindBin(win) {
    const list = win.querySelector('#binList');
    const line = win.querySelector('#binLine');
    const render = () => {
      list.innerHTML = '';
      if (state.binEmpty) { list.innerHTML = '<div class="bin-item">✨ пусто. тревоги удалены.</div>'; return; }
      DATA.binItems.forEach((item) => { const div = document.createElement('div'); div.className = 'bin-item'; div.innerHTML = `<span>📄</span><span>${item}</span>`; list.appendChild(div); });
    };
    win.querySelector('#emptyBin').addEventListener('click', () => { state.binEmpty = true; line.textContent = 'Удалено. Тут остаётся только тёплое.'; saveState(); render(); confetti(16, win.getBoundingClientRect().left+190, win.getBoundingClientRect().top+120, ['✨','🗑️']); });
    render();
  }

  function typeText(node, text, speed, done) {
    node.textContent = '';
    let i = 0;
    const timer = setInterval(() => {
      node.textContent += text[i] || '';
      i += 1;
      if (i >= text.length) { clearInterval(timer); done?.(); }
    }, speed);
  }

  function resetState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
    location.href = location.pathname + '?reset=1';
  }

  function playTone(freq = 440, dur = 0.06, type = 'sine') {
    if (!state.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx) audioCtx = new Ctx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.value = 0.025;
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.stop(audioCtx.currentTime + dur);
    } catch (err) {}
  }

  function setupCanvas() {
    const canvas = els.fxCanvas; fxCtx = canvas.getContext('2d');
    const resize = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; fxCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); };
    resize(); window.addEventListener('resize', resize);
    const tick = () => {
      fxCtx.clearRect(0,0,innerWidth,innerHeight);
      fxParticles = fxParticles.filter(p => p.life > 0);
      fxParticles.forEach(p => { p.life -= .016; p.x += p.vx; p.y += p.vy; p.vy += .03; fxCtx.globalAlpha = Math.max(0, p.life); fxCtx.font = `${p.size}px Tahoma`; fxCtx.fillText(p.text, p.x, p.y); });
      fxCtx.globalAlpha = 1; requestAnimationFrame(tick);
    };
    tick();
  }

  function confetti(count, x, y, symbols) {
    for (let i = 0; i < count; i++) {
      fxParticles.push({ text: symbols[i % symbols.length], x, y, vx: (Math.random()-.5)*5, vy: -Math.random()*5-1, life: 1 + Math.random()*.6, size: 17 + Math.random()*11 });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
