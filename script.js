// ================================================================
//  QUIZ QUEST — DUEL OF THE SCHOLARS
//  Full Production Script — Complete & Corrected
// ================================================================

'use strict';

/* ──────────────────────────────────────────────
   CONSTANTS & LOOKUP TABLES
─────────────────────────────────────────────── */
const SUBJECTS = {
    0: { name: 'Mathematics',        folder: 'math'             },
    1: { name: 'Science',            folder: 'science'          },
    2: { name: 'Combined Physics',   folder: 'combined-physics' },
    3: { name: 'Pure Physics',       folder: 'pure-physics'     },
    4: { name: 'Combined Chemistry', folder: 'combined-chem'    },
    5: { name: 'Pure Chemistry',     folder: 'pure-chem'        }
};

const LEVELS = {
    1: { name: 'Primary',         folder: 'primary'         },
    2: { name: 'Lower Secondary', folder: 'lower-secondary' },
    3: { name: 'Upper Secondary', folder: 'upper-secondary' }
};

const PLAYER_AVATARS = ['😎', '🤓'];
const PLAYER_NAMES   = ['Player 1', 'Player 2'];
const MAX_HP         = 100;

const TREASURE_POOL = [
    { emoji: '⚔️',  name: 'Power Surge',    desc: 'Deal +5 bonus damage on next attack.',     type: 'damage_boost', value: 5  },
    { emoji: '🛡️',  name: 'Iron Shield',    desc: 'Block all damage from next wrong answer.', type: 'shield',       value: 1  },
    { emoji: '❤️',  name: 'Healing Potion', desc: 'Restore 15 HP instantly.',                 type: 'heal',         value: 15 },
    { emoji: '🔥',  name: 'Combo Ignite',   desc: 'Instantly gain 2x combo multiplier.',      type: 'combo_boost',  value: 2  },
    { emoji: '💊',  name: 'Curse Cure',     desc: 'Instantly remove your own curse.',          type: 'cure_curse',   value: 0  },
    { emoji: '⚡',  name: 'Steal HP',       desc: 'Steal 10 HP from your opponent.',           type: 'hp_steal',     value: 10 },
    { emoji: '🕐',  name: 'Time Warp',      desc: 'Add +15 seconds to next question.',         type: 'time_bonus',   value: 15 },
    { emoji: '💀',  name: 'Curse Bomb',     desc: 'Opponent gets CURSED immediately!',         type: 'curse_enemy',  value: 0  },
    { emoji: '🎯',  name: 'Double Damage',  desc: 'Double damage on your next question.',      type: 'double_dmg',   value: 2  },
    { emoji: '🌀',  name: 'Nothing...',     desc: 'A decoy box. Better luck next time!',       type: 'nothing',      value: 0  }
];

const KNOWN_QUIZ_PINS = [
    '342091', '342092', '320011', '320012', '210011',
    '130011', '130012', '131011', '131021', '340091'
];

/* ──────────────────────────────────────────────
   GAME STATE
─────────────────────────────────────────────── */
const GS = {
    // PIN & loading
    pin:           ['', '', '', '', '', ''],
    currentDigit:  0,
    loadedCode:    '',
    quizInfo:      null,
    rawQuestions:  [],

    // Board
    boardQuestions:   [],
    penaltyQueue:     [],
    cards:            [],
    totalCards:       0,
    completedCount:   0,
    specialCardIdxs:  new Set(),
    treasureCardIdxs: new Set(),
    doubleCardIdxs:   new Set(),

    // Active question
    currentCardIdx:   -1,
    currentIsCurse:   false,
    selectedAnswer:   null,
    answered:         false,

    // Turn
    currentPlayer:    0,

    // Timer
    timerInterval:    null,
    timeLeft:         0,
    timerMax:         0,

    // Treasure
    treasureRewards:  [],
    catalogCache:     [],

    // Sound
    soundOn:          true,

    lastAttemptedPath: ''
};

// Combat state — separated for clarity
const CS = {
    hp:           [MAX_HP, MAX_HP],
    combos:       [0, 0],
    cursed:       [false, false],
    shields:      [false, false],
    damageBoost:  [0, 0],
    doubleDmg:    [false, false],
    timeBonus:    [0, 0],
    scores:       [0, 0],
    penaltiesHit: [0, 0],
    curseRecoil:  [15, 15],   // escalates +5 per failed penalty
    roundNum:     1
};

/* ──────────────────────────────────────────────
   AUDIO ENGINE
─────────────────────────────────────────────── */
class AudioEngine {
    constructor() {
        try {
            this.ctx   = new (window.AudioContext || window.webkitAudioContext)();
            this.ready = true;
        } catch { this.ready = false; }
    }

    _tone(freq, type = 'sine', duration = 0.15, volume = 0.3, startDelay = 0) {
        if (!this.ready || !GS.soundOn) return;
        try {
            this.ctx.resume();
            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startDelay);
            gain.gain.setValueAtTime(volume, this.ctx.currentTime + startDelay);
            gain.gain.exponentialRampToValueAtTime(
                0.001,
                this.ctx.currentTime + startDelay + duration
            );
            osc.start(this.ctx.currentTime + startDelay);
            osc.stop(this.ctx.currentTime  + startDelay + duration + 0.05);
        } catch {}
    }

    click() {
        this._tone(440, 'sine', 0.08, 0.2);
    }

    correct() {
        this._tone(523, 'sine', 0.12, 0.3, 0.00);
        this._tone(659, 'sine', 0.12, 0.3, 0.12);
        this._tone(784, 'sine', 0.18, 0.35, 0.24);
    }

    wrong() {
        this._tone(220, 'sawtooth', 0.08, 0.3, 0.00);
        this._tone(180, 'sawtooth', 0.15, 0.3, 0.08);
    }

    curse() {
        this._tone(150, 'square', 0.05, 0.25, 0.00);
        this._tone(100, 'square', 0.12, 0.35, 0.05);
        this._tone(80,  'square', 0.20, 0.40, 0.17);
    }

    crit() {
        this._tone(880,  'square', 0.06, 0.35, 0.00);
        this._tone(1046, 'square', 0.10, 0.40, 0.06);
        this._tone(1318, 'sine',   0.14, 0.30, 0.16);
    }

    treasure() {
        [523, 587, 659, 698, 784].forEach((f, i) =>
            this._tone(f, 'sine', 0.15, 0.3, i * 0.1)
        );
    }

    damage() {
        this._tone(180, 'square', 0.08, 0.4);
    }

    victory() {
        [523, 659, 784, 1047].forEach((f, i) =>
            this._tone(f, 'triangle', 0.3, 0.5, i * 0.15)
        );
    }

    tick() {
        this._tone(800, 'square', 0.04, 0.15);
    }

    flipCard() {
        this._tone(350, 'sine', 0.1, 0.2);
    }
}

const audio = new AudioEngine();

/* ──────────────────────────────────────────────
   CONFETTI ENGINE
─────────────────────────────────────────────── */
class ConfettiEngine {
    constructor(canvasId) {
        this.canvas  = document.getElementById(canvasId);
        this.ctx     = this.canvas?.getContext('2d');
        this.pieces  = [];
        this.running = false;
        if (this.canvas) this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        if (!this.canvas) return;
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    burst(x, y, colors = ['#fbbf24','#a855f7','#10b981','#ef4444','#3b82f6'], count = 30) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            this.pieces.push({
                x, y,
                vx:       Math.cos(angle) * speed,
                vy:       Math.sin(angle) * speed - 4,
                color:    colors[Math.floor(Math.random() * colors.length)],
                size:     5 + Math.random() * 6,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10,
                gravity:  0.3,
                life:     1,
                decay:    0.015 + Math.random() * 0.01
            });
        }
        if (!this.running) this._loop();
    }

    celebrate() {
        const w = window.innerWidth, h = window.innerHeight;
        this.burst(w * 0.2, h * 0.3);
        setTimeout(() => this.burst(w * 0.8, h * 0.3), 200);
        setTimeout(() => this.burst(w * 0.5, h * 0.2), 400);
        setTimeout(() => this.burst(w * 0.3, h * 0.4), 600);
        setTimeout(() => this.burst(w * 0.7, h * 0.4), 800);
    }

    _loop() {
        if (!this.ctx) return;
        this.running = true;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.pieces  = this.pieces.filter(p => p.life > 0);
        this.pieces.forEach(p => {
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotSpeed;
            p.life     -= p.decay;
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, p.life);
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation * Math.PI / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            this.ctx.restore();
        });
        if (this.pieces.length > 0) requestAnimationFrame(() => this._loop());
        else this.running = false;
    }
}

let confetti;

/* ──────────────────────────────────────────────
   MATH & TABLE RENDERER
─────────────────────────────────────────────── */
function renderMath(text) {
    if (!text) return '';
    let t = String(text);

    // Escape HTML
    t = t.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;');

    // Code blocks
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Pipe tables — detect and hand off
    if (t.includes('|')) {
        const lines = t.split('\n');
        if (lines.some(l => l.trim().startsWith('|'))) {
            return renderTable(t);
        }
    }

    // Fractions: integer/integer
    t = t.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_, n, d) =>
        `<span class="math-frac">` +
        `<span class="math-num">${n}</span>` +
        `<span class="math-den">${d}</span>` +
        `</span>`
    );

    // Superscripts: ^{expr} or ^digit
    t = t.replace(/\^{([^}]+)}/g, '<sup class="math-sup">$1</sup>');
    t = t.replace(/\^(\d+)/g,     '<sup class="math-sup">$1</sup>');

    // Subscripts: _{expr} or _char
    t = t.replace(/_{([^}]+)}/g, '<sub class="math-sub">$1</sub>');
    t = t.replace(/_(\w)/g,      '<sub class="math-sub">$1</sub>');

    // Square roots
    t = t.replace(/√\(([^)]+)\)/g,
        '<span class="math-sqrt">√<span class="math-sqrt-content">$1</span></span>');
    t = t.replace(/√(\w+)/g,
        '<span class="math-sqrt">√<span class="math-sqrt-content">$1</span></span>');

    // Degrees
    t = t.replace(/(\d+)°/g, '$1&deg;');

    // Arrows
    t = t.replace(/→|->/g, '&rarr;');
    t = t.replace(/←/g,    '&larr;');

    // Greek letters
    const greek = {
        alpha:'α', beta:'β', gamma:'γ', delta:'δ', lambda:'λ',
        mu:'μ', pi:'π', sigma:'σ', theta:'θ', omega:'ω',
        Delta:'Δ', Sigma:'Σ', Omega:'Ω', infinity:'∞'
    };
    Object.entries(greek).forEach(([k, v]) => {
        t = t.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
    });

    // Newlines
    t = t.replace(/\n/g, '<br>');

    return t;
}

function renderTable(text) {
    const lines    = text.split('\n');
    let inTable    = false;
    let result     = '';
    let tableHtml  = '';
    let isHeader   = true;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|')) {
            if (!inTable) {
                inTable   = true;
                tableHtml = '<table class="math-table">';
                isHeader  = true;
            }
            // Separator row (---|--- style)
            if (trimmed.replace(/[\|:\-\s]/g, '') === '') {
                isHeader = false;
                continue;
            }
            const cells = trimmed
                .split('|')
                .filter((_, i, a) => i > 0 && i < a.length - 1);
            const tag = isHeader ? 'th' : 'td';
            tableHtml += `<tr>${cells.map(c =>
                `<${tag}>${renderMath(c.trim())}</${tag}>`
            ).join('')}</tr>`;
            if (isHeader) isHeader = false;
        } else {
            if (inTable) {
                tableHtml += '</table>';
                result    += tableHtml;
                inTable    = false;
                tableHtml  = '';
            }
            result += line ? renderMath(line) + '<br>' : '<br>';
        }
    }
    if (inTable) result += tableHtml + '</table>';
    return result;
}

/* ──────────────────────────────────────────────
   SCREEN MANAGEMENT
─────────────────────────────────────────────── */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}

/* ──────────────────────────────────────────────
   SCORE POPUP
─────────────────────────────────────────────── */
function showScorePopup(text, x, y, type = 'damage') {
    const layer = document.getElementById('score-popups');
    if (!layer) return;
    const el    = document.createElement('div');
    el.className      = `score-popup popup-${type}`;
    el.textContent    = text;
    el.style.left     = `${x - 30}px`;
    el.style.top      = `${y}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

/* ──────────────────────────────────────────────
   PIN SYSTEM
─────────────────────────────────────────────── */
function updatePinDisplay() {
    for (let i = 0; i < 6; i++) {
        const el  = document.getElementById(`digit${i + 1}`);
        if (!el) continue;
        const num = el.querySelector('.digit-number');
        const val = GS.pin[i];
        num.textContent = val !== '' ? val : '_';
        el.classList.toggle('filled',       val !== '');
        el.classList.toggle('active-digit', i === GS.currentDigit && val === '');
    }
    updatePinDecoded();
}

function updatePinDecoded() {
    const filled = GS.pin.filter(d => d !== '').length;
    const el     = document.getElementById('pin-decoded');
    if (!el) return;
    if (filled < 1) { el.textContent = ''; return; }

    const code = GS.pin.join('');
    const info = decodeQuizCode(code);
    if (!info)  { el.textContent = ''; return; }

    const parts = [];
    if (filled >= 1) parts.push(LEVELS[parseInt(GS.pin[0])]?.name || '?');
    if (filled >= 2) parts.push(SUBJECTS[parseInt(GS.pin[1])]?.name || '?');
    if (filled >= 3) parts.push(parseInt(GS.pin[0]) === 1 ? `P${GS.pin[2]}` : `S${GS.pin[2]}`);
    if (filled >= 5) parts.push(`Ch ${parseInt(GS.pin[3] + GS.pin[4]) || '?'}`);
    if (filled >= 6) parts.push(`WS ${GS.pin[5]}`);

    el.textContent = parts.filter(Boolean).join(' · ');
}

function addDigit(d) {
    if (GS.currentDigit >= 6) return;
    GS.pin[GS.currentDigit] = String(d);
    GS.currentDigit++;
    audio.click();
    updatePinDisplay();
    if (GS.currentDigit === 6) setTimeout(submitPin, 200);
}

function removeLastDigit() {
    if (GS.currentDigit <= 0) return;
    GS.currentDigit--;
    GS.pin[GS.currentDigit] = '';
    audio.click();
    updatePinDisplay();
}

function clearPin() {
    GS.pin          = ['', '', '', '', '', ''];
    GS.currentDigit = 0;
    updatePinDisplay();
    const dec = document.getElementById('pin-decoded');
    if (dec) dec.textContent = '';
}

function setPinFromCode(code) {
    const clean = code.replace(/-/g, '');
    GS.pin          = clean.split('').slice(0, 6);
    GS.currentDigit = 6;
    updatePinDisplay();
}

function decodeQuizCode(code) {
    const s = code.replace(/-/g, '');
    if (s.length !== 6) return null;

    const digits  = s.split('').map(Number);
    const [lvl, sub, grade, ch10, ch1, ws] = digits;

    if (lvl < 1 || lvl > 3) return null;
    if (sub < 0 || sub > 5) return null;
    if (ws  < 1 || ws  > 9) return null;

    const level      = LEVELS[lvl];
    const subject    = SUBJECTS[sub];
    const chapter    = parseInt(`${ch10}${ch1}`);
    const gradeLabel = lvl === 1 ? `P${grade}` : `S${grade}`;
    const filename   = `${s}.json`;
    const filepath   = `Questions/${level.folder}/${subject.folder}/${filename}`;
    const formatted  = `${lvl}${sub}${grade}-${ch10}${ch1}-${ws}`;

    return {
        code: formatted, filename, filepath,
        level: level.name, subject: subject.name,
        gradeLabel, chapter, worksheet: ws,
        fullName: `${gradeLabel} ${subject.name} Ch${chapter} WS${ws}`,
        raw: s
    };
}

/* ──────────────────────────────────────────────
   QUIZ LOADING
─────────────────────────────────────────────── */
async function submitPin() {
    const pin = GS.pin.join('');
    if (pin.length !== 6 || GS.pin.includes('')) return;

    const info = decodeQuizCode(pin);
    if (!info) {
        showError('Invalid PIN format. Please check your 6-digit code.');
        return;
    }

    GS.lastAttemptedPath = info.filepath;
    GS.loadedCode        = info.code;
    GS.quizInfo          = info;

    showScreen('loading-screen');
    setLoading('Connecting...', `Looking for ${info.filename}`, 20);

    try {
        await fakeDelay(300);
        setLoading('Fetching quiz file...', info.filepath, 50);

        const resp = await fetch(info.filepath);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${info.filename} not found.`);

        setLoading('Parsing questions...', 'Building the battlefield...', 80);
        const data = await resp.json();

        if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
            throw new Error('JSON has no valid questions array.');
        }

        await fakeDelay(300);
        setLoading('Ready!', `${data.questions.length} questions loaded!`, 100);

        GS.rawQuestions   = data.questions;
        GS.quizInfo.title = data.title || info.fullName;

        saveToCatalog(info, GS.quizInfo.title);

        await fakeDelay(400);
        startGame();

    } catch (err) {
        console.error('Quiz load error:', err);
        showError(
            `<strong>Could not load:</strong> <code>${info.filepath}</code><br><br>` +
            `<strong>Reason:</strong> ${err.message}<br><br>` +
            `Ensure the file exists at the correct path and is valid JSON.`
        );
    }
}

function setLoading(msg, detail, progress) {
    const lm = document.getElementById('loading-message');
    const ld = document.getElementById('loading-details');
    const pb = document.getElementById('scan-progress');
    if (lm) lm.textContent  = msg;
    if (ld) ld.textContent  = detail;
    if (pb) pb.style.width  = `${progress}%`;
}

function showError(html) {
    const el = document.getElementById('error-message');
    if (el) el.innerHTML = html;
    showScreen('error-screen');
}

function fakeDelay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* ──────────────────────────────────────────────
   CATALOG (localStorage)
─────────────────────────────────────────────── */
function saveToCatalog(info, title) {
    try {
        const catalog = JSON.parse(localStorage.getItem('quizCatalog') || '[]');
        if (!catalog.find(c => c.raw === info.raw)) {
            catalog.push({ raw: info.raw, code: info.code, title, fullName: info.fullName });
            localStorage.setItem('quizCatalog', JSON.stringify(catalog.slice(-30)));
        }
    } catch {}
}

function loadCatalog() {
    try {
        GS.catalogCache = JSON.parse(localStorage.getItem('quizCatalog') || '[]');
    } catch {
        GS.catalogCache = [];
    }
    renderCatalog();
}

function renderCatalog() {
    const box   = document.getElementById('quiz-catalog');
    const count = document.getElementById('quiz-count');
    if (!box) return;
    if (count) count.textContent =
        `${GS.catalogCache.length} quiz${GS.catalogCache.length !== 1 ? 'zes' : ''}`;
    box.innerHTML = '';
    GS.catalogCache.slice().reverse().forEach(item => {
        const div       = document.createElement('div');
        div.className   = 'catalog-item';
        div.innerHTML   =
            `<div class="ci-code">${item.code}</div>` +
            `<div class="ci-title">${item.title || item.fullName}</div>`;
        div.addEventListener('click', () => {
            setPinFromCode(item.raw);
            submitPin();
        });
        box.appendChild(div);
    });
}

async function scanQuizzes() {
    showScreen('loading-screen');
    setLoading('Scanning for quizzes...', 'Checking known PINs...', 0);

    const found = [];
    for (let i = 0; i < KNOWN_QUIZ_PINS.length; i++) {
        const pin  = KNOWN_QUIZ_PINS[i];
        const info = decodeQuizCode(pin);
        if (!info) continue;
        setLoading('Scanning...', `Checking ${pin}`, Math.round((i / KNOWN_QUIZ_PINS.length) * 100));
        try {
            const r = await fetch(info.filepath, { method: 'HEAD' });
            if (r.ok) {
                found.push(info);
                saveToCatalog(info, info.fullName);
            }
        } catch {}
        await fakeDelay(60);
    }

    loadCatalog();
    showScreen('pin-screen');
}

/* ──────────────────────────────────────────────
   GAME INITIALIZATION
─────────────────────────────────────────────── */
function startGame() {
    showScreen('game-screen');
    initGame();
}

function initGame() {
    // Reset combat state
    CS.hp           = [MAX_HP, MAX_HP];
    CS.combos       = [0, 0];
    CS.cursed       = [false, false];
    CS.shields      = [false, false];
    CS.damageBoost  = [0, 0];
    CS.doubleDmg    = [false, false];
    CS.timeBonus    = [0, 0];
    CS.scores       = [0, 0];
    CS.penaltiesHit = [0, 0];
    CS.curseRecoil  = [15, 15];
    CS.roundNum     = 1;

    // Reset game state
    GS.currentPlayer  = 0;
    GS.currentCardIdx = -1;
    GS.currentIsCurse = false;
    GS.answered       = false;
    GS.selectedAnswer = null;
    GS.completedCount = 0;

    hideAllOverlays();
    buildBoard();

    const qt  = document.getElementById('quiz-title');
    const qtp = document.getElementById('quiz-topic');
    const qc  = document.getElementById('current-quiz-code');
    if (qt)  qt.textContent  = GS.quizInfo?.title    || 'Quiz Quest';
    if (qtp) qtp.textContent = GS.quizInfo?.fullName || '';
    if (qc)  qc.textContent  = GS.loadedCode;

    updateCombatUI();
    updateTurnBanner();
}

/* ──────────────────────────────────────────────
   BOARD BUILDER
─────────────────────────────────────────────── */
function buildBoard() {
    const board = document.getElementById('card-board');
    if (!board) return;
    board.innerHTML = '';

    GS.cards            = [];
    GS.specialCardIdxs  = new Set();
    GS.treasureCardIdxs = new Set();
    GS.doubleCardIdxs   = new Set();

    // Shuffle all questions
    const shuffled = shuffleArray([...GS.rawQuestions]);

    // Reserve 20% (min 2, max 6) for penalty queue
    const reserveCount  = Math.min(6, Math.max(2, Math.floor(shuffled.length * 0.2)));
    GS.penaltyQueue     = shuffled.slice(0, reserveCount);
    GS.boardQuestions   = shuffled.slice(reserveCount);

    const total         = GS.boardQuestions.length;
    GS.totalCards       = total;
    GS.completedCount   = 0;

    // Assign special/treasure/double card indices
    const specialCount  = Math.max(1, Math.floor(total * 0.10));
    const treasureCount = Math.max(2, Math.floor(total * 0.15));
    const allIdxs       = shuffleArray([...Array(total).keys()]);

    allIdxs.slice(0, specialCount)
           .forEach(i => GS.doubleCardIdxs.add(i));
    allIdxs.slice(specialCount, specialCount + treasureCount)
           .forEach(i => GS.treasureCardIdxs.add(i));

    // Build card elements
    for (let i = 0; i < total; i++) {
        const isTreasure = GS.treasureCardIdxs.has(i);
        const isDouble   = GS.doubleCardIdxs.has(i);

        let cardClass = 'flip-card';
        let icon      = '❓';
        if (isTreasure) { cardClass += ' treasure'; icon = '🎁'; }
        else if (isDouble) { cardClass += ' double'; icon = '⚡'; }

        const card = document.createElement('div');
        card.className   = cardClass;
        card.dataset.idx = i;
        card.innerHTML   = `
            <div class="flip-card-inner">
                <div class="flip-card-front">
                    <span class="card-number">${i + 1}</span>
                    <span class="card-icon">${icon}</span>
                </div>
                <div class="flip-card-back">
                    <span class="card-result-icon"></span>
                    <span class="card-result-label"></span>
                </div>
            </div>`;
        card.addEventListener('click', () => onCardClick(i));
        board.appendChild(card);

        GS.cards.push({
            el: card, index: i,
            flipped: false, completed: false,
            isTreasure, isDouble
        });
    }

    updateCardsUI();
    const tr = document.getElementById('treasures-remaining');
    if (tr) tr.textContent = GS.treasureCardIdxs.size;
}

/* ──────────────────────────────────────────────
   CARD INTERACTION
─────────────────────────────────────────────── */
function onCardClick(idx) {
    const card = GS.cards[idx];
    const pi   = GS.currentPlayer;

    if (!card || card.completed || card.flipped) return;

    // Cursed player must face penalty before picking a card
    if (CS.cursed[pi]) {
        showCurseWarning();
        return;
    }

    audio.flipCard();
    card.flipped = true;
    card.el.classList.add('flipped');
    GS.currentCardIdx  = idx;
    GS.currentIsCurse  = false;

    if (card.isTreasure) {
        setTimeout(() => showTreasure(), 500);
    } else {
        setTimeout(() => openQuestion(false), 500);
    }
}

/* ──────────────────────────────────────────────
   CURSE WARNING MODAL
─────────────────────────────────────────────── */
function showCurseWarning() {
    const pi  = GS.currentPlayer;
    const el  = document.getElementById('curse-modal-name');
    if (el) el.textContent = `${PLAYER_NAMES[pi]} must face a penalty question first!`;
    document.getElementById('curse-overlay')?.classList.add('show');
    audio.curse();
}

/* ──────────────────────────────────────────────
   QUESTION DISPLAY
─────────────────────────────────────────────── */
function openQuestion(isCurse) {
    const pi = GS.currentPlayer;

    // Guard: penalty queue exhausted
    if (isCurse && GS.penaltyQueue.length === 0) {
        CS.cursed[pi]      = false;
        CS.curseRecoil[pi] = 15;
        updateCombatUI();
        showScorePopup('Curse Forgiven! (No questions left)',
                       window.innerWidth / 2, 200, 'shield');
        switchTurn();
        return;
    }

    const q        = isCurse
        ? GS.penaltyQueue[0]
        : GS.boardQuestions[GS.currentCardIdx];
    const isDouble = !isCurse && GS.cards[GS.currentCardIdx]?.isDouble;

    // Failsafe
    if (!q) { switchTurn(); return; }

    GS.selectedAnswer = null;
    GS.answered       = false;

    // Modal theme
    const modal = document.getElementById('q-modal-container');
    if (modal) {
        modal.classList.remove('cursed-modal', 'double-modal', 'special-modal');
        if (isCurse)  modal.classList.add('cursed-modal');
        if (isDouble) modal.classList.add('double-modal');
    }

    // Player indicator
    const piEl = document.getElementById('q-player-indicator');
    if (piEl) {
        piEl.className = `q-player-indicator q-pi-p${pi + 1}${isCurse ? ' q-pi-curse' : ''}`;
    }
    const qpiAvatar = document.getElementById('qpi-avatar');
    const qpiName   = document.getElementById('qpi-name');
    const qpiType   = document.getElementById('qpi-type');
    if (qpiAvatar) qpiAvatar.textContent = PLAYER_AVATARS[pi];
    if (qpiName)   qpiName.textContent   = `${PLAYER_NAMES[pi]} answering...`;
    if (qpiType)   qpiType.textContent   =
        isCurse  ? `⚠️ CURSE GAUNTLET — Fail = ${CS.curseRecoil[pi]} DMG` :
        isDouble ? '⚡ DOUBLE DAMAGE' : '';

    // Q header
    const qNum    = document.getElementById('q-number');
    const qPts    = document.getElementById('q-points');
    const qSpec   = document.getElementById('q-special');
    if (qNum)  qNum.textContent  =
        isCurse ? `⚠️ CURSE #${CS.penaltiesHit[pi] + 1}` : `Q${GS.currentCardIdx + 1}`;
    if (qPts)  qPts.textContent  =
        isCurse ? 'Survive!' : `${q.points || 10} DMG`;
    if (qSpec) qSpec.textContent =
        isCurse  ? `💀 Fail = ${CS.curseRecoil[pi]} recoil · next = ${CS.curseRecoil[pi] + 5}` :
        isDouble ? '⚡ 2× Damage!' : '';

    // Question text
    const qText = document.getElementById('question-text');
    if (qText) qText.innerHTML = renderMath(q.question);

    // Options
    const optBox = document.getElementById('options-container');
    if (optBox) {
        optBox.innerHTML = '';
        (q.options || []).forEach((opt, i) => {
            const btn       = document.createElement('button');
            btn.className   = 'q-option';
            btn.innerHTML   =
                `<span class="option-letter">${String.fromCharCode(65 + i)}</span>` +
                `<span class="option-text">${renderMath(opt)}</span>`;
            btn.addEventListener('click', () => selectOption(i));
            optBox.appendChild(btn);
        });
    }

    // Reset result UI
    const submitBtn = document.getElementById('submit-answer');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.remove('hidden'); }

    const banner  = document.getElementById('q-result-banner');
    const explain = document.getElementById('q-explanation');
    const nextBtn = document.getElementById('next-btn');
    if (banner)  { banner.className  = 'q-result-banner'; banner.innerHTML  = ''; }
    if (explain) { explain.className = 'q-explanation';   explain.innerHTML = ''; }
    if (nextBtn)   nextBtn.classList.add('hidden');

    // Show overlay
    document.getElementById('question-overlay')?.classList.add('show');

    // Timer
    const timeAllowed    = (q.time || 45) + (CS.timeBonus[pi] || 0);
    CS.timeBonus[pi]     = 0;
    startTimer(timeAllowed);
}

/* ──────────────────────────────────────────────
   OPTION SELECTION
─────────────────────────────────────────────── */
function selectOption(i) {
    if (GS.answered) return;
    document.querySelectorAll('.q-option').forEach(o => o.classList.remove('selected'));
    const opts = document.querySelectorAll('.q-option');
    if (opts[i]) opts[i].classList.add('selected');
    GS.selectedAnswer = i;
    const submitBtn   = document.getElementById('submit-answer');
    if (submitBtn) submitBtn.disabled = false;
    audio.click();
}

/* ──────────────────────────────────────────────
   TIMER
─────────────────────────────────────────────── */
function startTimer(seconds) {
    stopTimer();
    GS.timeLeft = seconds;
    GS.timerMax = seconds;
    updateTimerUI();
    GS.timerInterval = setInterval(() => {
        GS.timeLeft--;
        updateTimerUI();
        if (GS.timeLeft <= 0) {
            stopTimer();
            handleTimeout();
        } else if (GS.timeLeft <= 5) {
            audio.tick();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(GS.timerInterval);
    GS.timerInterval = null;
}

function updateTimerUI() {
    const pct    = (GS.timeLeft / GS.timerMax) * 100;
    const bar    = document.getElementById('timer-bar');
    const txt    = document.getElementById('timer-text');
    const clk    = document.querySelector('.timer-clock');
    if (bar) {
        bar.style.width = `${pct}%`;
        bar.classList.remove('warning', 'danger');
        if (pct <= 20)      bar.classList.add('danger');
        else if (pct <= 40) bar.classList.add('warning');
    }
    if (txt) txt.textContent = GS.timeLeft;
    if (clk) {
        clk.classList.remove('warning', 'danger');
        if (pct <= 20)      clk.classList.add('danger');
        else if (pct <= 40) clk.classList.add('warning');
    }
}

/* ──────────────────────────────────────────────
   ANSWER SUBMISSION
─────────────────────────────────────────────── */
function submitAnswer() {
    if (GS.answered || GS.selectedAnswer === null) return;
    GS.answered = true;
    stopTimer();

    const pi       = GS.currentPlayer;
    const opponent = 1 - pi;
    const isCurse  = GS.currentIsCurse;
    const q        = isCurse
        ? GS.penaltyQueue[0]
        : GS.boardQuestions[GS.currentCardIdx];
    const isDouble = !isCurse && GS.cards[GS.currentCardIdx]?.isDouble;
    const correct  = GS.selectedAnswer === q.correct;

    // Lock options and reveal correct answer
    document.querySelectorAll('.q-option').forEach((opt, i) => {
        opt.classList.add('locked');
        if (i === q.correct)                     opt.classList.add('correct');
        if (i === GS.selectedAnswer && !correct) opt.classList.add('wrong-selected');
    });

    document.getElementById('submit-answer')?.classList.add('hidden');
    const banner = document.getElementById('q-result-banner');

    /* ════════════════════════════════════════
       CORRECT
    ════════════════════════════════════════ */
    if (correct) {
        audio.correct();

        if (isCurse) {
            /* ── CURSE BROKEN ── */
            CS.cursed[pi]      = false;
            CS.curseRecoil[pi] = 15;
            CS.combos[pi]++;
            GS.penaltyQueue.shift();

            if (banner) {
                banner.className = 'q-result-banner correct-banner show';
                banner.innerHTML =
                    `<div>🛡️ Curse Broken! ${PLAYER_NAMES[pi]} is free!</div>
                     <div class="result-sub">🔥 Combo now ${CS.combos[pi]}x — keep it going!</div>`;
            }
            showScorePopup('Curse Broken! 🛡️', window.innerWidth / 2, 200, 'shield');
            showExplanation(q);
            updateCombatUI();
            showNextButton(() => switchTurn());

        } else {
            /* ── CORRECT NORMAL ── */
            CS.combos[pi]++;

            // Damage calculation
            let dmg = q.points || 10;
            if (isDouble)                dmg *= 2;
            if (CS.doubleDmg[pi])      { dmg *= 2;                 CS.doubleDmg[pi]    = false; }
            if (CS.damageBoost[pi] > 0){ dmg += CS.damageBoost[pi]; CS.damageBoost[pi] = 0;    }

            // Combo multiplier (caps at ×2.2 at 8 stacks)
            const comboMult  = 1 + (Math.min(CS.combos[pi] - 1, 8) * 0.15);
            dmg = Math.round(dmg * comboMult);

            // Speed bonus
            const timePct    = GS.timeLeft / GS.timerMax;
            const speedBonus = timePct > 0.7 ? 3 : timePct > 0.5 ? 1 : 0;
            dmg += speedBonus;

            // Critical hit — 15% chance, ×1.5
            const isCrit = Math.random() < 0.15;
            if (isCrit) {
                dmg = Math.round(dmg * 1.5);
                audio.crit();
                showScorePopup('⚡ CRITICAL!', window.innerWidth / 2, 100, 'combo');
            }

            applyDamage(opponent, dmg, true);
            CS.scores[pi] += dmg;
            markCardCorrect(GS.currentCardIdx);

            // Result message
            const headline = [
                isCrit ? '⚡ CRITICAL HIT!' : '💥',
                `${dmg} Damage`,
                speedBonus > 0 ? `+${speedBonus} Speed Bonus` : ''
            ].filter(Boolean).join(' · ');

            const subline = [
                `🔥 ${CS.combos[pi]}x Combo`,
                comboMult > 1 ? `×${comboMult.toFixed(1)} Multiplier` : '',
                isDouble      ? '⚡ Double Card' : ''
            ].filter(Boolean).join(' · ');

            if (banner) {
                banner.className = 'q-result-banner correct-banner show';
                banner.innerHTML =
                    `<div>${headline}</div><div class="result-sub">${subline}</div>`;
            }

            showScorePopup(
                `-${dmg} HP${isCrit ? ' ⚡' : ''}`,
                window.innerWidth / 2, 150,
                isCrit ? 'combo' : 'damage'
            );
            if (CS.combos[pi] >= 3) {
                showScorePopup(
                    `🔥 ${CS.combos[pi]}x Combo!`,
                    window.innerWidth / 2, 210, 'combo'
                );
            }

            showExplanation(q);
            updateCombatUI();
            if (checkGameOver()) return;
            showNextButton(() => switchTurn());
        }

    /* ════════════════════════════════════════
       WRONG
    ════════════════════════════════════════ */
    } else {
        audio.wrong();
        CS.combos[pi] = 0;

        if (isCurse) {
            /* ── CHAIN PENALTY — recoil escalates ── */
            const recoil = CS.curseRecoil[pi];
            applyDamage(pi, recoil, false);
            CS.penaltiesHit[pi]++;
            CS.curseRecoil[pi] += 5;
            cyclePenaltyQueue();

            if (banner) {
                banner.className = 'q-result-banner incorrect-banner show';
                banner.innerHTML =
                    `<div>❌ Penalty Failed! ${recoil} Recoil Damage taken.</div>
                     <div class="result-sub">⚠️ Next penalty = ${CS.curseRecoil[pi]} DMG. Another question incoming!</div>`;
            }

            showScorePopup(`-${recoil} Recoil!`, window.innerWidth / 2, 150, 'curse');
            showExplanation(q);
            updateCombatUI();
            if (checkGameOver()) return;

            // Force another penalty question immediately after reading
            showNextButton(() => {
                document.getElementById('question-overlay')?.classList.remove('show');
                setTimeout(() => openQuestion(true), 450);
            });

        } else {
            /* ── FAILED NORMAL QUESTION ── */
            if (CS.shields[pi]) {
                CS.shields[pi] = false;
                updateShieldUI(pi);
                if (banner) {
                    banner.className = 'q-result-banner incorrect-banner show';
                    banner.innerHTML =
                        `<div>❌ Wrong — but 🛡️ Shield absorbed the curse!</div>
                         <div class="result-sub">Shield is gone. Be careful next time!</div>`;
                }
                showScorePopup('Shield Blocks Curse! 🛡️',
                               window.innerWidth / 2, 150, 'shield');
            } else {
                CS.cursed[pi]      = true;
                CS.curseRecoil[pi] = 15;
                if (banner) {
                    banner.className = 'q-result-banner incorrect-banner show';
                    banner.innerHTML =
                        `<div>⚠️ CURSED! ${PLAYER_NAMES[pi]} enters the Curse Gauntlet.</div>
                         <div class="result-sub">Answer correctly to break free, or take ${CS.curseRecoil[pi]}+ escalating damage!</div>`;
                }
                showScorePopup('CURSED! ⚠️', window.innerWidth / 2, 150, 'curse');
                audio.curse();
            }

            markCardFailed(GS.currentCardIdx);
            showExplanation(q);
            updateCombatUI();
            showNextButton(() => switchTurn());
        }
    }
}

/* ──────────────────────────────────────────────
   HANDLE TIMEOUT
─────────────────────────────────────────────── */
function handleTimeout() {
    if (GS.answered) return;
    GS.answered = true;
    const pi    = GS.currentPlayer;

    document.querySelectorAll('.q-option').forEach(o => o.classList.add('locked'));
    document.getElementById('submit-answer')?.classList.add('hidden');
    audio.wrong();

    const banner = document.getElementById('q-result-banner');
    const q      = GS.currentIsCurse
        ? GS.penaltyQueue[0]
        : GS.boardQuestions[GS.currentCardIdx];

    if (GS.currentIsCurse) {
        // Timeout on penalty = wrong answer
        const recoil = CS.curseRecoil[pi];
        applyDamage(pi, recoil, false);
        CS.penaltiesHit[pi]++;
        CS.curseRecoil[pi] += 5;
        cyclePenaltyQueue();

        if (banner) {
            banner.className = 'q-result-banner timeout-banner show';
            banner.innerHTML =
                `<div>⏱️ TIME'S UP! ${recoil} Recoil Damage taken.</div>
                 <div class="result-sub">Next penalty = ${CS.curseRecoil[pi]} DMG. Another question incoming!</div>`;
        }

        showExplanation(q);
        updateCombatUI();
        if (checkGameOver()) return;

        showNextButton(() => {
            document.getElementById('question-overlay')?.classList.remove('show');
            setTimeout(() => openQuestion(true), 450);
        });

    } else {
        // Timeout on normal question
        CS.combos[pi] = 0;

        if (CS.shields[pi]) {
            CS.shields[pi] = false;
            updateShieldUI(pi);
            if (banner) {
                banner.className = 'q-result-banner timeout-banner show';
                banner.innerHTML =
                    `<div>⏱️ Time's up — 🛡️ Shield blocked the curse!</div>
                     <div class="result-sub">Your shield is gone.</div>`;
            }
        } else {
            CS.cursed[pi]      = true;
            CS.curseRecoil[pi] = 15;
            if (banner) {
                banner.className = 'q-result-banner timeout-banner show';
                banner.innerHTML =
                    `<div>⏱️ TIME'S UP! ⚠️ ${PLAYER_NAMES[pi]} is now CURSED.</div>
                     <div class="result-sub">Face the Curse Gauntlet next turn!</div>`;
            }
        }

        markCardFailed(GS.currentCardIdx);
        showExplanation(q);
        updateCombatUI();
        showNextButton(() => switchTurn());
    }
}

/* ──────────────────────────────────────────────
   COMBAT HELPERS
─────────────────────────────────────────────── */
function applyDamage(playerIdx, amount, shake = true) {
    CS.hp[playerIdx] = Math.max(0, CS.hp[playerIdx] - amount);
    if (shake) {
        const sbEl = document.getElementById(`sb-p${playerIdx + 1}`);
        if (sbEl) {
            sbEl.classList.remove('damage-shake');
            void sbEl.offsetWidth; // force reflow
            sbEl.classList.add('damage-shake');
            setTimeout(() => sbEl.classList.remove('damage-shake'), 600);
        }
    }
    audio.damage();
}

function applyHeal(playerIdx, amount) {
    CS.hp[playerIdx] = Math.min(MAX_HP, CS.hp[playerIdx] + amount);
    showScorePopup(`+${amount} HP ❤️`, window.innerWidth / 2, 150, 'heal');
}

function markCardCorrect(idx) {
    const card = GS.cards[idx];
    if (!card) return;
    card.completed = true;
    card.el.classList.add('result-correct', 'completed');
    const ri = card.el.querySelector('.card-result-icon');
    const rl = card.el.querySelector('.card-result-label');
    if (ri) ri.textContent = '✅';
    if (rl) rl.textContent = 'Correct';
    GS.completedCount++;
    const rect = card.el.getBoundingClientRect();
    confetti?.burst(rect.left + 40, rect.top + 40, ['#10b981', '#34d399', '#fbbf24']);
}

function markCardFailed(idx) {
    const card = GS.cards[idx];
    if (!card) return;
    card.completed = true;
    card.el.classList.add('result-incorrect', 'completed');
    const ri = card.el.querySelector('.card-result-icon');
    const rl = card.el.querySelector('.card-result-label');
    if (ri) ri.textContent = '❌';
    if (rl) rl.textContent = 'Missed';
    GS.completedCount++;
}

function markCardTreasure(idx) {
    const card = GS.cards[idx];
    if (!card) return;
    card.completed = true;
    card.el.classList.add('result-treasure', 'completed');
    const ri = card.el.querySelector('.card-result-icon');
    const rl = card.el.querySelector('.card-result-label');
    if (ri) ri.textContent = '🎁';
    if (rl) rl.textContent = 'Treasure!';
    GS.completedCount++;
}

function cyclePenaltyQueue() {
    if (GS.penaltyQueue.length > 1) {
        GS.penaltyQueue.push(GS.penaltyQueue.shift());
    }
}

function updateCardsUI() {
    const el = document.getElementById('cards-remaining');
    if (el) el.textContent = GS.totalCards - GS.completedCount;
}

/* ──────────────────────────────────────────────
   TURN MANAGEMENT
─────────────────────────────────────────────── */
function switchTurn() {
    hideAllOverlays();
    updateCardsUI();
    GS.currentPlayer = 1 - GS.currentPlayer;
    CS.roundNum      = Math.floor(GS.completedCount / 2) + 1;
    updateTurnBanner();
    updateCombatUI();
    checkBoardComplete();
}

function checkBoardComplete() {
    if (GS.completedCount >= GS.totalCards) {
        setTimeout(() => triggerGameOver(false), 800);
    }
}

function updateTurnBanner() {
    const pi     = GS.currentPlayer;
    const banner = document.getElementById('turn-banner');
    const avatar = document.getElementById('turn-avatar');
    const text   = document.getElementById('turn-text');

    if (banner) {
        banner.className =
            `turn-banner p${pi + 1}-turn${CS.cursed[pi] ? ' curse-turn' : ''}`;
    }
    if (avatar) avatar.textContent = PLAYER_AVATARS[pi];
    if (text) {
        text.textContent = CS.cursed[pi]
            ? `${PLAYER_NAMES[pi]} is CURSED — tap any card to face penalty!`
            : `${PLAYER_NAMES[pi]}'s Turn — Pick a card!`;
    }

    document.getElementById('sb-p1')?.classList.toggle('active', pi === 0);
    document.getElementById('sb-p2')?.classList.toggle('active', pi === 1);
}

/* ──────────────────────────────────────────────
   COMBAT UI
─────────────────────────────────────────────── */
function updateCombatUI() {
    for (let i = 0; i < 2; i++) {
        const pct  = (CS.hp[i] / MAX_HP) * 100;
        const fill = document.getElementById(`hp-fill-${i + 1}`);
        const hpTx = document.getElementById(`hp-text-${i + 1}`);
        const cmb  = document.getElementById(`combo-${i + 1}`);
        const scr  = document.getElementById(`score-chip-${i + 1}`);
        const crs  = document.getElementById(`curse-${i + 1}`);
        const shld = document.getElementById(`shield-${i + 1}`);

        if (fill) {
            fill.style.width = `${pct}%`;
            fill.classList.toggle('critical', pct <= 25);
        }
        if (hpTx) hpTx.textContent = `${CS.hp[i]} / ${MAX_HP}`;
        if (cmb)  {
            cmb.textContent = `🔥 ${CS.combos[i]}x`;
            cmb.classList.toggle('on-fire', CS.combos[i] >= 3);
        }
        if (scr)  scr.textContent  = `⭐ ${CS.scores[i]}`;
        if (crs)  crs.classList.toggle('hidden',  !CS.cursed[i]);
        if (shld) shld.classList.toggle('hidden', !CS.shields[i]);
    }

    const rd = document.getElementById('round-display');
    if (rd) rd.textContent = `Round ${CS.roundNum}`;

    const tr = document.getElementById('treasures-remaining');
    if (tr) {
        const remaining = [...GS.treasureCardIdxs]
            .filter(idx => !GS.cards[idx]?.completed).length;
        tr.textContent = remaining;
    }
}

function updateShieldUI(pi) {
    const el = document.getElementById(`shield-${pi + 1}`);
    if (el) el.classList.toggle('hidden', !CS.shields[pi]);
}

/* ──────────────────────────────────────────────
   EXPLANATION & NEXT BUTTON
─────────────────────────────────────────────── */
function showExplanation(q) {
    if (!q?.explanation) return;
    const el = document.getElementById('q-explanation');
    if (!el) return;
    el.innerHTML = `<strong>💡 Explanation:</strong> ${renderMath(q.explanation)}`;
    el.classList.add('show');
}

function showNextButton(callback) {
    const btn = document.getElementById('next-btn');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.style.display = 'flex';
    btn.onclick = () => {
        btn.classList.add('hidden');
        if (typeof callback === 'function') callback();
    };
}

/* ──────────────────────────────────────────────
   TREASURE SYSTEM
─────────────────────────────────────────────── */
function showTreasure() {
    const pi = GS.currentPlayer;
    audio.treasure();
    markCardTreasure(GS.currentCardIdx);

    // Pick 3 random rewards (no duplicates)
    GS.treasureRewards = shuffleArray([...TREASURE_POOL]).slice(0, 3);

    const title = document.getElementById('treasure-title');
    const badge = document.getElementById('treasure-tier-badge');
    if (title) title.textContent = `${PLAYER_NAMES[pi]}, choose your treasure!`;
    if (badge) badge.textContent = 'Pick 1 of 3 mystery boxes';

    // Reset each box
    document.querySelectorAll('.t-box').forEach((box, i) => {
        box.classList.remove('open');
        box.classList.add('available');
        const front = box.querySelector('.t-box-front');
        if (front) front.textContent = '🎁';
        const back = document.getElementById(`t-back-${i}`);
        if (back) back.innerHTML = '';
        box.onclick = () => openTreasureBox(i);
    });

    const result  = document.getElementById('treasure-result');
    const contBtn = document.getElementById('treasure-continue');
    if (result)  result.textContent = '';
    if (contBtn) contBtn.classList.add('hidden');

    document.getElementById('treasure-overlay')?.classList.add('show');
}

function openTreasureBox(boxIdx) {
    const box = document.querySelector(`.t-box[data-box="${boxIdx}"]`);
    if (!box || !box.classList.contains('available')) return;

    const reward = GS.treasureRewards[boxIdx];
    const pi     = GS.currentPlayer;

    // Flip chosen box
    box.classList.remove('available');
    box.classList.add('open');
    const chosenBack = document.getElementById(`t-back-${boxIdx}`);
    if (chosenBack) {
        chosenBack.innerHTML =
            `<span style="font-size:1.8rem">${reward.emoji}</span>` +
            `<span style="font-size:0.72rem;color:#94a3b8">${reward.name}</span>`;
    }

    // Reveal other boxes (dimmed)
    document.querySelectorAll('.t-box').forEach((b, i) => {
        if (i !== boxIdx) {
            b.classList.remove('available');
            b.classList.add('open');
            const ob = document.getElementById(`t-back-${i}`);
            const r  = GS.treasureRewards[i];
            if (ob) {
                ob.innerHTML =
                    `<span style="font-size:1.4rem;opacity:0.4">${r.emoji}</span>` +
                    `<span style="font-size:0.65rem;color:#64748b">${r.name}</span>`;
            }
        }
    });

    // Apply effect
    applyTreasureReward(reward, pi);

    const result  = document.getElementById('treasure-result');
    const contBtn = document.getElementById('treasure-continue');
    if (result) {
        result.innerHTML =
            `<strong>${reward.emoji} ${reward.name}:</strong> ${reward.desc}`;
    }
    if (contBtn) {
        contBtn.classList.remove('hidden');
        contBtn.onclick = () => {
            document.getElementById('treasure-overlay')?.classList.remove('show');
            switchTurn();
        };
    }

    audio.treasure();
    confetti?.burst(window.innerWidth / 2, window.innerHeight / 2);
}

function applyTreasureReward(reward, pi) {
    const opponent = 1 - pi;
    switch (reward.type) {
        case 'heal':
            applyHeal(pi, reward.value);
            break;
        case 'shield':
            CS.shields[pi] = true;
            updateShieldUI(pi);
            showScorePopup('🛡️ Shield Active!', window.innerWidth / 2, 150, 'shield');
            break;
        case 'damage_boost':
            CS.damageBoost[pi] += reward.value;
            showScorePopup(`⚔️ +${reward.value} DMG Boost!`, window.innerWidth / 2, 150, 'combo');
            break;
        case 'combo_boost':
            CS.combos[pi] += reward.value;
            showScorePopup(`🔥 Combo +${reward.value}!`, window.innerWidth / 2, 150, 'combo');
            break;
        case 'cure_curse':
            CS.cursed[pi]      = false;
            CS.curseRecoil[pi] = 15;
            showScorePopup('💊 Curse Cured!', window.innerWidth / 2, 150, 'shield');
            break;
        case 'hp_steal':
            applyHeal(pi, reward.value);
            applyDamage(opponent, reward.value, true);
            showScorePopup(`⚡ Stole ${reward.value} HP!`, window.innerWidth / 2, 150, 'combo');
            break;
        case 'time_bonus':
            CS.timeBonus[pi] += reward.value;
            showScorePopup(`🕐 +${reward.value}s Next Q!`, window.innerWidth / 2, 150, 'heal');
            break;
        case 'curse_enemy':
            CS.cursed[opponent]      = true;
            CS.curseRecoil[opponent] = 15;
            audio.curse();
            showScorePopup('💀 Enemy Cursed!', window.innerWidth / 2, 150, 'curse');
            break;
        case 'double_dmg':
            CS.doubleDmg[pi] = true;
            showScorePopup('🎯 Double Damage Ready!', window.innerWidth / 2, 150, 'combo');
            break;
        case 'nothing':
            showScorePopup('🌀 Nothing...', window.innerWidth / 2, 150, 'miss');
            break;
    }
    updateCombatUI();
}

/* ──────────────────────────────────────────────
   GAME OVER
─────────────────────────────────────────────── */
function checkGameOver() {
    if (CS.hp[0] <= 0 || CS.hp[1] <= 0) {
        setTimeout(() => triggerGameOver(true), 1200);
        return true;
    }
    return false;
}

function triggerGameOver(byKO) {
    stopTimer();
    hideAllOverlays();

    let winner;
    if (byKO) {
        winner = CS.hp[0] <= 0 ? 1 : 0;
    } else {
        winner = CS.hp[0] >= CS.hp[1] ? 0 : 1;
    }

    audio.victory();
    confetti?.celebrate();

    const goEl   = document.getElementById('go-celebration');
    const goMsg  = document.getElementById('winner-message');
    const goName = document.getElementById('winner-name');
    const goStat = document.getElementById('go-stats');

    if (goEl)   goEl.textContent  = '🏆';
    if (goMsg)  goMsg.textContent = byKO ? '⚡ KNOCKOUT! ⚡' : '🏁 Board Cleared!';
    if (goName) goName.textContent =
        `${PLAYER_AVATARS[winner]} ${PLAYER_NAMES[winner]} Wins!`;

    if (goStat) {
        goStat.innerHTML = `
            <div class="go-stat">
                <div class="go-stat-label">${PLAYER_NAMES[0]} HP</div>
                <div class="go-stat-value">${CS.hp[0]}</div>
            </div>
            <div class="go-stat">
                <div class="go-stat-label">${PLAYER_NAMES[1]} HP</div>
                <div class="go-stat-value">${CS.hp[1]}</div>
            </div>
            <div class="go-stat">
                <div class="go-stat-label">${PLAYER_NAMES[0]} Score</div>
                <div class="go-stat-value">${CS.scores[0]}</div>
            </div>
            <div class="go-stat">
                <div class="go-stat-label">${PLAYER_NAMES[1]} Score</div>
                <div class="go-stat-value">${CS.scores[1]}</div>
            </div>
            <div class="go-stat">
                <div class="go-stat-label">Cards Cleared</div>
                <div class="go-stat-value">${GS.completedCount} / ${GS.totalCards}</div>
            </div>
            <div class="go-stat">
                <div class="go-stat-label">Victory Type</div>
                <div class="go-stat-value">${byKO ? '💥 KO' : '🏁 Board'}</div>
            </div>`;
    }

    document.getElementById('game-over')?.classList.add('show');
}

/* ──────────────────────────────────────────────
   OVERLAY MANAGEMENT
─────────────────────────────────────────────── */
function hideAllOverlays() {
    document.getElementById('question-overlay')?.classList.remove('show');
    document.getElementById('treasure-overlay')?.classList.remove('show');
    document.getElementById('curse-overlay')?.classList.remove('show');
}

/* ──────────────────────────────────────────────
   UTILITY
─────────────────────────────────────────────── */
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* ──────────────────────────────────────────────
   DOM READY — ALL EVENT BINDINGS
─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    // Init engines
    confetti = new ConfettiEngine('confetti-canvas');

    // ── PIN keypad ──
    document.querySelectorAll('.key[data-key]').forEach(btn => {
        btn.addEventListener('click', () => addDigit(parseInt(btn.dataset.key)));
    });
    document.getElementById('clear-btn')
        ?.addEventListener('click', removeLastDigit);
    document.getElementById('submit-pin')
        ?.addEventListener('click', submitPin);

    // ── Quick actions ──
    document.getElementById('test-pin')?.addEventListener('click', () => {
        setPinFromCode('342091');
        submitPin();
    });
    document.getElementById('scan-quizzes')
        ?.addEventListener('click', scanQuizzes);

    // ── In-game buttons ──
    document.getElementById('submit-answer')
        ?.addEventListener('click', submitAnswer);

    document.getElementById('restart-btn')?.addEventListener('click', () => {
        document.getElementById('game-over')?.classList.remove('show');
        initGame();
    });

    document.getElementById('new-chapter-btn')?.addEventListener('click', () => {
        document.getElementById('game-over')?.classList.remove('show');
        clearPin();
        showScreen('pin-screen');
        loadCatalog();
    });

    document.getElementById('home-btn')?.addEventListener('click', () => {
        stopTimer();
        hideAllOverlays();
        document.getElementById('game-over')?.classList.remove('show');
        clearPin();
        showScreen('pin-screen');
        loadCatalog();
    });

    // ── Error screen ──
    document.getElementById('back-to-pin-error')?.addEventListener('click', () => {
        clearPin();
        showScreen('pin-screen');
    });
    document.getElementById('retry-btn')?.addEventListener('click', () => {
        if (!GS.pin.includes('') && GS.pin.join('').length === 6) submitPin();
        else showScreen('pin-screen');
    });

    // ── Curse overlay ──
    document.getElementById('curse-start-btn')?.addEventListener('click', () => {
        document.getElementById('curse-overlay')?.classList.remove('show');
        GS.currentIsCurse = true;
        GS.currentCardIdx = 'penalty';
        openQuestion(true);
    });

    // ── Sound toggle ──
    document.getElementById('sound-btn')?.addEventListener('click', () => {
        GS.soundOn = !GS.soundOn;
        const icon = document.getElementById('sound-icon');
        if (icon) icon.className = GS.soundOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    });

    // ── Unified keyboard handler ──
    document.addEventListener('keydown', (e) => {
        const activeScreen = document.querySelector('.screen.active');
        const qOverlay     = document.getElementById('question-overlay');
        const tOverlay     = document.getElementById('treasure-overlay');
        const nextBtn      = document.getElementById('next-btn');
        const tNextBtn     = document.getElementById('treasure-continue');
        const qActive      = qOverlay?.classList.contains('show');
        const tActive      = tOverlay?.classList.contains('show');

        // PIN screen — number keys
        if (activeScreen?.id === 'pin-screen' && !qActive && !tActive) {
            if (e.key >= '0' && e.key <= '9') { addDigit(parseInt(e.key)); return; }
            if (e.key === 'Backspace')          { removeLastDigit();          return; }
            if (e.key === 'Enter')              { submitPin();                return; }
        }

        if (!qActive && !tActive) return;

        // Enter / Space — advance or submit
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (qActive && !nextBtn?.classList.contains('hidden')) {
                nextBtn.click(); return;
            }
            if (tActive && !tNextBtn?.classList.contains('hidden')) {
                tNextBtn.click(); return;
            }
            if (qActive && !GS.answered && GS.selectedAnswer !== null) {
                submitAnswer(); return;
            }
        }

        // A–D or 1–4 to select options
        if (qActive && !GS.answered) {
            const keyMap = { a:0, b:1, c:2, d:3, '1':0, '2':1, '3':2, '4':3 };
            const idx    = keyMap[e.key.toLowerCase()];
            if (idx !== undefined) {
                const opts = document.querySelectorAll('.q-option:not(.locked)');
                if (opts[idx]) selectOption(idx);
            }
        }
    });

    // ── Initial load ──
    loadCatalog();
    updatePinDisplay();
});