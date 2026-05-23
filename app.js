/**
 * Grand Royale Blackjack
 * Live Multiplayer Casino - Solo / Duo / Trio
 *
 * Architecture:
 *  - Stable userId in localStorage (name changes never duplicate leaderboard entries)
 *  - Single Play table; mode selector chooses solo/duo/trio capacity
 *  - Online: Firebase Firestore live session sync (bets, cards, actions)
 *  - Offline-mode toggle (HUD):
 *      ON  -> Plätze sofort mit Bots aufgefüllt (oder rein lokal in Solo)
 *      OFF -> Es wird unbegrenzt auf echte Spieler gewartet
 *  - All popups are in-app toasts (no native alert/confirm).
 *  - End of round -> everyone returns to lobby.
 */

(function () {
    'use strict';

    // ====================================================================
    // FIREBASE CONFIGURATION
    // ====================================================================
    // The included config is the user's existing project. Swap if needed.
    // For GitHub Pages: only safe (public) Firestore rules in test mode.
    const firebaseConfig = {
        apiKey: "AIzaSyDwZ2VR_pA-JSJGEGPD0ergCO8xuB0-GuM",
        authDomain: "blackjack-75f44.firebaseapp.com",
        projectId: "blackjack-75f44",
        storageBucket: "blackjack-75f44.firebasestorage.app",
        messagingSenderId: "818903940827",
        appId: "1:818903940827:web:0734301f76c1e3080396fe",
        measurementId: "G-TJM3LRH98R"
    };

    let db = null;
    let isFirebaseConfigured = false;

    try {
        if (firebaseConfig && firebaseConfig.apiKey && typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            isFirebaseConfigured = true;
        }
    } catch (e) {
        console.error('Firebase init failed:', e);
    }

    // ====================================================================
    // SVG SUIT & AVATAR ICONS
    // ====================================================================
    const SUITS = {
        SPADES:   { name: 'spades',   char: '\u2660', color: 'black', icon: 'ico-spade' },
        HEARTS:   { name: 'hearts',   char: '\u2665', color: 'red',   icon: 'ico-heart' },
        DIAMONDS: { name: 'diamonds', char: '\u2666', color: 'red',   icon: 'ico-diamond' },
        CLUBS:    { name: 'clubs',    char: '\u2663', color: 'black', icon: 'ico-club' }
    };

    // Catalog of usable avatar SVG ids (no emojis on the table).
    const AVATAR_LIBRARY = [
        { id: 'crown',   icon: 'ico-crown',   label: 'Krone' },
        { id: 'shield',  icon: 'ico-shield',  label: 'Schild' },
        { id: 'star',    icon: 'ico-star',    label: 'Stern' },
        { id: 'spade',   icon: 'ico-spade',   label: 'Pik' },
        { id: 'heart',   icon: 'ico-heart',   label: 'Herz' },
        { id: 'diamond', icon: 'ico-diamond', label: 'Karo' },
        { id: 'club',    icon: 'ico-club',    label: 'Kreuz' },
        { id: 'bolt',    icon: 'ico-bolt',    label: 'Blitz' },
        { id: 'flame',   icon: 'ico-flame',   label: 'Flamme' },
        { id: 'anchor',  icon: 'ico-anchor',  label: 'Anker' }
    ];

    function avatarIconId(avatarId) {
        const found = AVATAR_LIBRARY.find(a => a.id === avatarId);
        return found ? found.icon : 'ico-crown';
    }

    function avatarSVG(avatarId, classes = '') {
        return `<svg class="${classes}" viewBox="0 0 100 100"><use href="#${avatarIconId(avatarId)}"/></svg>`;
    }

    // ====================================================================
    // TOAST NOTIFICATIONS (replaces alert/confirm)
    // ====================================================================
    const Toast = (function () {
        const container = () => document.getElementById('toast-container');

        function show(message, type = 'info', durationMs = 3000) {
            const wrap = container();
            if (!wrap) return;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <div class="toast-icon"><svg viewBox="0 0 24 24"><use href="#ico-info"/></svg></div>
                <div class="toast-message"></div>
                <div class="toast-progress" style="animation-duration:${durationMs}ms"></div>
            `;
            toast.querySelector('.toast-message').textContent = message;
            wrap.appendChild(toast);

            const timer = setTimeout(() => dismiss(toast), durationMs);
            toast.addEventListener('click', () => {
                clearTimeout(timer);
                dismiss(toast);
            });
        }

        function dismiss(toast) {
            if (!toast || toast.classList.contains('leaving')) return;
            toast.classList.add('leaving');
            setTimeout(() => toast.remove(), 320);
        }

        function success(msg, d) { show(msg, 'success', d); }
        function error(msg, d) { show(msg, 'error', d); }
        function info(msg, d) { show(msg, 'info', d); }

        return { show, success, error, info };
    })();

    // In-app confirm modal (replaces native confirm)
    function inAppConfirm({ title, message, okText = 'OK', cancelText = 'Abbrechen', danger = false }) {
        return new Promise(resolve => {
            const modal = document.getElementById('modal-confirm');
            const btnOk = document.getElementById('btn-confirm-ok');
            const btnCancel = document.getElementById('btn-confirm-cancel');
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            btnOk.textContent = okText;
            btnCancel.textContent = cancelText;
            btnOk.className = `btn ${danger ? 'btn-danger' : 'btn-gold'}`;

            modal.classList.add('active');

            const cleanup = (result) => {
                modal.classList.remove('active');
                btnOk.removeEventListener('click', onOk);
                btnCancel.removeEventListener('click', onCancel);
                resolve(result);
            };
            const onOk = () => cleanup(true);
            const onCancel = () => cleanup(false);

            btnOk.addEventListener('click', onOk);
            btnCancel.addEventListener('click', onCancel);
        });
    }

    // ====================================================================
    // WEBAUDIO SOUND ENGINE
    // ====================================================================
    class SoundEngine {
        constructor() { this.ctx = null; this.muted = false; }
        init() {
            if (!this.ctx) {
                try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
                catch (e) { return; }
            }
            if (this.ctx.state === 'suspended') this.ctx.resume();
        }
        _osc(type, freq, dur, vol, ramp) {
            if (this.muted || !this.ctx) return;
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.connect(g); g.connect(this.ctx.destination);
            o.type = type; o.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (ramp) o.frequency.exponentialRampToValueAtTime(ramp, this.ctx.currentTime + dur);
            g.gain.setValueAtTime(vol, this.ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + dur);
            o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
        }
        click()       { this.init(); this._osc('sine', 450, 0.08, 0.10, 150); }
        chipDrop()    { this.init(); this._osc('triangle', 340, 0.05, 0.12, 800); this._osc('triangle', 420, 0.04, 0.08, 700); }
        cardSwoosh()  {
            if (this.muted) return; this.init(); if (!this.ctx) return;
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource(); noise.buffer = buf;
            const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
            f.frequency.setValueAtTime(1000, this.ctx.currentTime);
            f.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
            f.Q.setValueAtTime(5, this.ctx.currentTime);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.10, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
            noise.connect(f); f.connect(g); g.connect(this.ctx.destination);
            noise.start(); noise.stop(this.ctx.currentTime + 0.18);
        }
        win() {
            this.init(); if (!this.ctx) return;
            const notes = [261.63, 329.63, 392, 523.25];
            const now = this.ctx.currentTime;
            notes.forEach((f, i) => {
                const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
                o.connect(g); g.connect(this.ctx.destination);
                o.type = 'sine'; o.frequency.setValueAtTime(f, now + i * 0.10);
                g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.13, now + i * 0.10 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.10 + 0.35);
                o.start(now + i * 0.10); o.stop(now + i * 0.10 + 0.4);
            });
        }
        lose()  { this.init(); this._osc('sawtooth', 220, 0.45, 0.12, 80); }
        push()  { this.init(); this._osc('sine', 330, 0.30, 0.10); this._osc('sine', 360, 0.30, 0.08); }
        blackjack() {
            this.init(); if (!this.ctx) return;
            const chords = [392, 493.88, 587.33, 783.99, 987.77];
            const now = this.ctx.currentTime;
            chords.forEach((f, i) => {
                const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
                o.connect(g); g.connect(this.ctx.destination);
                o.type = 'triangle'; o.frequency.setValueAtTime(f, now + i * 0.06);
                g.gain.setValueAtTime(0.10, now + i * 0.06);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.5);
                o.start(now + i * 0.06); o.stop(now + i * 0.06 + 0.55);
            });
        }
        shuffle() {
            this.init(); if (!this.ctx) return;
            const now = this.ctx.currentTime;
            for (let i = 0; i < 6; i++) {
                const t = now + i * 0.07;
                const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
                o.connect(g); g.connect(this.ctx.destination);
                o.type = 'triangle';
                o.frequency.setValueAtTime(150 + Math.random() * 100, t);
                g.gain.setValueAtTime(0.07, t);
                g.gain.linearRampToValueAtTime(0.001, t + 0.06);
                o.start(t); o.stop(t + 0.07);
            }
        }
    }

    const sound = new SoundEngine();

    // ====================================================================
    // CARD / DECK MODEL
    // ====================================================================
    class Card {
        constructor(suit, rank, value) {
            this.suit = suit;    // suit object
            this.rank = rank;    // '2'-'10','J','Q','K','A'
            this.value = value;  // numeric value (A=11 base)
        }
        static fromPlain(p) {
            const suitKey = (p.suit || 'SPADES').toUpperCase();
            const suit = SUITS[suitKey] || SUITS.SPADES;
            return new Card(suit, p.rank, p.value);
        }
        toPlain() { return { suit: this.suit.name, rank: this.rank, value: this.value }; }
        render(isFaceDown = false) {
            const div = document.createElement('div');
            div.className = `playing-card ${this.suit.color}`;
            if (isFaceDown) { div.classList.add('card-back'); return div; }

            const top = document.createElement('div');
            top.className = 'card-corner top';
            top.innerHTML = `
                <span class="card-rank">${this.rank}</span>
                <span class="card-suit-icon"><svg viewBox="0 0 100 100"><use href="#${this.suit.icon}"/></svg></span>
            `;
            div.appendChild(top);

            const center = document.createElement('div');
            center.className = 'card-center';
            if (['J', 'Q', 'K'].includes(this.rank)) {
                center.innerHTML = `<span class="face-letter">${this.rank}</span>`;
            } else if (this.rank === 'A') {
                center.innerHTML = `<svg viewBox="0 0 100 100"><use href="#${this.suit.icon}"/></svg>`;
            } else {
                center.innerHTML = `<svg viewBox="0 0 100 100"><use href="#${this.suit.icon}"/></svg>`;
            }
            div.appendChild(center);

            const bottom = document.createElement('div');
            bottom.className = 'card-corner bottom';
            bottom.innerHTML = `
                <span class="card-rank">${this.rank}</span>
                <span class="card-suit-icon"><svg viewBox="0 0 100 100"><use href="#${this.suit.icon}"/></svg></span>
            `;
            div.appendChild(bottom);

            return div;
        }
    }

    class Deck {
        constructor(numDecks = 6) {
            this.numDecks = numDecks;
            this.cards = [];
            this.reset();
        }
        reset() {
            this.cards = [];
            const ranks = [
                { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 }, { r: '5', v: 5 },
                { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 }, { r: '9', v: 9 },
                { r: '10', v: 10 }, { r: 'J', v: 10 }, { r: 'Q', v: 10 }, { r: 'K', v: 10 },
                { r: 'A', v: 11 }
            ];
            for (let d = 0; d < this.numDecks; d++) {
                Object.values(SUITS).forEach(suit => {
                    ranks.forEach(rk => this.cards.push(new Card(suit, rk.r, rk.v)));
                });
            }
        }
        shuffle() {
            sound.shuffle();
            for (let i = this.cards.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
            }
        }
        draw() {
            if (this.cards.length === 0) { this.reset(); this.shuffle(); }
            return this.cards.pop();
        }
        get remaining() { return this.cards.length; }
    }

    function calcHandScore(cards) {
        let score = 0, aces = 0;
        cards.forEach(c => { score += c.value; if (c.rank === 'A') aces++; });
        while (score > 21 && aces > 0) { score -= 10; aces--; }
        return score;
    }

    // ====================================================================
    // BOT POOL (fictional opponents - only used when offline mode ON)
    // ====================================================================
    const BOT_POOL = [
        { name: 'Viktor',     avatar: 'flame',   coins: 2150,  level: 6  },
        { name: 'Sophia',     avatar: 'crown',   coins: 5900,  level: 9  },
        { name: 'Klaus',      avatar: 'shield',  coins: 800,   level: 2  },
        { name: 'Elena',      avatar: 'star',    coins: 1250,  level: 4  },
        { name: 'Dieter',     avatar: 'anchor',  coins: 3400,  level: 7  },
        { name: 'Isabella',   avatar: 'diamond', coins: 14500, level: 12 },
        { name: 'Maximilian', avatar: 'bolt',    coins: 4800,  level: 8  },
        { name: 'Clara',      avatar: 'heart',   coins: 540,   level: 1  },
        { name: 'Hans',       avatar: 'club',    coins: 1850,  level: 3  },
        { name: 'Mia',        avatar: 'spade',   coins: 1850,  level: 5  }
    ];

    function pickRandomBot(exclude = []) {
        const pool = BOT_POOL.filter(b => !exclude.includes(b.name));
        return pool[Math.floor(Math.random() * pool.length)] || BOT_POOL[0];
    }

    function buildBotSeat(usedNames = []) {
        const bot = pickRandomBot(usedNames);
        return {
            userId: 'bot_' + bot.name.toLowerCase() + '_' + Math.random().toString(36).slice(2, 6),
            name: bot.name,
            avatar: bot.avatar,
            coins: bot.coins,
            rank: levelToRank(bot.level),
            level: bot.level,
            cards: [],
            score: 0,
            bet: 0,
            stand: false,
            bust: false,
            isBot: true,
            ready: false,
            joinedAt: Date.now()
        };
    }

    // ====================================================================
    // RANK HELPERS
    // ====================================================================
    function levelToRank(lvl) {
        if (lvl >= 25) return 'Casino Legende';
        const tiers = ['Bronze', 'Silber', 'Gold', 'Platin', 'Diamant'];
        const tierIdx = Math.min(tiers.length - 1, Math.floor((lvl - 1) / 5));
        const sub = 5 - ((lvl - 1) % 5);
        const roman = ['I', 'II', 'III', 'IV', 'V'][Math.max(0, sub - 1)];
        return `${tiers[tierIdx]} ${roman}`;
    }

    // ====================================================================
    // STABLE USER ID (independent of name changes)
    // ====================================================================
    function getOrCreateUserId() {
        let id = localStorage.getItem('gr_user_id');
        if (!id) {
            id = 'u_' + Math.random().toString(36).slice(2, 12) + '_' + Date.now().toString(36);
            localStorage.setItem('gr_user_id', id);
        }
        return id;
    }

    // ====================================================================
    // MAIN GAME MANAGER
    // ====================================================================
    class GameManager {
        constructor() {
            this.userId = getOrCreateUserId();

            this.player = {
                name: 'Spieler',
                avatar: 'crown',
                coins: 1000,
                xp: 0,
                level: 1,
                stats: { handsPlayed: 0, handsWon: 0, blackjacks: 0, highestChips: 1000 },
                lastDailySpin: 0
            };

            // Offline mode (true = bots fill empty seats immediately; false = wait forever)
            this.offlineMode = false;

            // Lobby / matchmaking / table state
            this.deck = new Deck(6);
            this.deck.shuffle();
            this.selectedMode = 'solo';

            this.currentPhase = 'LOBBY';      // 'LOBBY' | 'MATCHMAKING' | 'BETTING' | 'DEALING' | 'PLAYING' | 'DEALER' | 'OUTCOME'
            this.session = null;              // local mirror of cloud session
            this.sessionDocRef = null;
            this.sessionListener = null;
            this.isHost = false;
            this.matchmakingTimeout = null;
            this.botFillTimeout = null;
            this.botTurnTimeout = null;
            this.lobbyReturnTimeout = null;
            this.outcomeShown = false;

            // Daily Wheel
            this.wheelPrizes = [
                { val: 100,  label: '100',   color: '#15803d' },
                { val: 250,  label: '250',   color: '#facc15' },
                { val: 50,   label: '50',    color: '#14532d' },
                { val: 500,  label: '500',   color: '#16a34a' },
                { val: 150,  label: '150',   color: '#15803d' },
                { val: 1000, label: '1K',    color: '#ca8a04' },
                { val: 200,  label: '200',   color: '#14532d' },
                { val: 0,    label: 'Niete', color: '#374151' }
            ];

            this.wheelInterval = null;
            this.lastNetworkLog = 0;
        }

        // ============================================================
        // INITIALIZATION
        // ============================================================
        init() {
            this.loadProfile();
            this.loadOfflineModePreference();
            this.cacheDOM();
            this.buildAvatarGrid();
            this.buildDailyWheel();
            this.registerEvents();
            this.updateOnlineModeUI();
            this.renderLobby();
            this.startBackgroundSimulations();
            this.startOnlineCountUpdater();
        }

        cacheDOM() {
            this.screenLobby = document.getElementById('screen-lobby');
            this.screenMatchmaking = document.getElementById('screen-matchmaking');
            this.screenTable = document.getElementById('screen-game-table');
            this.modalProfile = document.getElementById('modal-profile');
            this.modalRules = document.getElementById('modal-rules');
            this.inputNickname = document.getElementById('input-nickname');
            this.seatsContainer = document.getElementById('seats-container');
            this.modeToggle = document.getElementById('online-mode-toggle');
            this.modeToggleLabel = document.getElementById('mode-toggle-label');

            // Admin DOM
            this.modalAdminLogin = document.getElementById('modal-admin-login');
            this.modalAdminPanel = document.getElementById('modal-admin-panel');
            this.inputAdminPwd = document.getElementById('input-admin-pwd');
        }

        loadProfile() {
            const saved = localStorage.getItem('gr_profile_v2');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    Object.assign(this.player, data);
                    if (!this.player.stats) {
                        this.player.stats = { handsPlayed: 0, handsWon: 0, blackjacks: 0, highestChips: 1000 };
                    }
                    if (!this.player.lastDailySpin) this.player.lastDailySpin = 0;
                    if (typeof this.player.avatar !== 'string' || !AVATAR_LIBRARY.some(a => a.id === this.player.avatar)) {
                        this.player.avatar = 'crown';
                    }
                } catch (e) {
                    console.warn('Profil-Reset:', e);
                }
            } else {
                // initial default name uses a friendly random suffix once.
                this.player.name = 'Spieler_' + Math.floor(100 + Math.random() * 900);
            }
            this.recalculateRank();
        }

        loadOfflineModePreference() {
            const v = localStorage.getItem('gr_offline_mode');
            this.offlineMode = (v === '1');
        }
        saveOfflineModePreference() {
            localStorage.setItem('gr_offline_mode', this.offlineMode ? '1' : '0');
        }

        saveProfile() {
            this.player.stats.highestChips = Math.max(this.player.stats.highestChips, this.player.coins);
            localStorage.setItem('gr_profile_v2', JSON.stringify(this.player));
            this.updateHUD();

            if (isFirebaseConfigured) {
                // Use stable userId so renaming never creates a new leaderboard entry.
                db.collection('leaderboard').doc(this.userId).set({
                    userId: this.userId,
                    name: this.player.name,
                    avatar: this.player.avatar,
                    coins: this.player.coins,
                    rank: this.player.rankName,
                    level: this.player.level,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(err => {
                    console.warn('Leaderboard write failed:', err);
                });
            }
        }

        recalculateRank() {
            this.player.level = Math.floor(Math.sqrt(this.player.xp / 100)) + 1;
            this.player.rankName = levelToRank(this.player.level);
        }

        addXP(amount) {
            const oldLevel = this.player.level;
            this.player.xp += amount;
            this.recalculateRank();
            if (this.player.level > oldLevel) {
                const bonus = this.player.level * 100;
                this.player.coins += bonus;
                Toast.success(`LEVEL UP! Du bist jetzt Level ${this.player.level}. +${bonus} Münzen!`, 4000);
            }
            this.saveProfile();
        }

        // ============================================================
        // DOM BUILDERS
        // ============================================================
        buildAvatarGrid() {
            const grid = document.getElementById('avatar-grid');
            grid.innerHTML = '';
            AVATAR_LIBRARY.forEach(a => {
                const btn = document.createElement('button');
                btn.className = 'avatar-select-btn';
                btn.dataset.avatar = a.id;
                btn.innerHTML = `<svg viewBox="0 0 100 100"><use href="#${a.icon}"/></svg>`;
                btn.title = a.label;
                grid.appendChild(btn);
            });
        }

        buildDailyWheel() {
            const spinner = document.getElementById('wheel-spinner');
            spinner.innerHTML = '';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.style.width = '100%';
            svg.style.height = '100%';

            const degStep = 360 / this.wheelPrizes.length;
            this.wheelPrizes.forEach((prize, idx) => {
                const aStart = idx * degStep - 90 - (degStep / 2);
                const aEnd = (idx + 1) * degStep - 90 - (degStep / 2);
                const rs = aStart * Math.PI / 180;
                const re = aEnd * Math.PI / 180;
                const x1 = 50 + 50 * Math.cos(rs), y1 = 50 + 50 * Math.sin(rs);
                const x2 = 50 + 50 * Math.cos(re), y2 = 50 + 50 * Math.sin(re);
                const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                p.setAttribute('d', `M 50 50 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 50 50 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`);
                p.setAttribute('fill', prize.color);
                p.setAttribute('stroke', '#0d1f14');
                p.setAttribute('stroke-width', '0.5');
                svg.appendChild(p);

                const aText = idx * degStep - 90;
                const rt = aText * Math.PI / 180;
                const tx = 50 + 32 * Math.cos(rt), ty = 50 + 32 * Math.sin(rt);
                const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                t.setAttribute('x', tx.toFixed(2));
                t.setAttribute('y', (ty + 1.8).toFixed(2));
                t.setAttribute('fill', '#ffffff');
                t.setAttribute('font-size', '5');
                t.setAttribute('font-family', 'Montserrat, sans-serif');
                t.setAttribute('font-weight', 'bold');
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('transform', `rotate(${aText}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`);
                t.textContent = prize.label;
                svg.appendChild(t);
            });
            const hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hub.setAttribute('cx', '50'); hub.setAttribute('cy', '50'); hub.setAttribute('r', '8');
            hub.setAttribute('fill', '#facc15'); hub.setAttribute('stroke', '#ffffff'); hub.setAttribute('stroke-width', '1.5');
            svg.appendChild(hub);
            spinner.appendChild(svg);
        }

        // ============================================================
        // EVENT REGISTRATION
        // ============================================================
        registerEvents() {
            document.getElementById('btn-show-rules').addEventListener('click', () => {
                sound.click(); this.modalRules.classList.add('active');
            });
            document.getElementById('close-rules-modal').addEventListener('click', () => {
                sound.click(); this.modalRules.classList.remove('active');
            });

            document.getElementById('btn-show-profile').addEventListener('click', () => this.openProfileModal());
            document.getElementById('close-profile-modal').addEventListener('click', () => {
                sound.click(); this.modalProfile.classList.remove('active');
            });
            document.getElementById('btn-save-profile').addEventListener('click', () => this.saveProfileFromModal());

            // sound toggle
            const btnSound = document.getElementById('btn-sound-toggle');
            btnSound.addEventListener('click', () => {
                sound.muted = !sound.muted;
                const useEl = document.getElementById('sound-icon-use');
                if (useEl) useEl.setAttribute('href', sound.muted ? '#ico-sound-off' : '#ico-sound-on');
                if (!sound.muted) sound.click();
            });

            // online/offline toggle
            this.modeToggle.addEventListener('click', () => {
                this.offlineMode = !this.offlineMode;
                this.saveOfflineModePreference();
                this.updateOnlineModeUI();
                Toast.info(
                    this.offlineMode
                        ? 'Offline-Modus aktiviert · Plätze werden mit Bots aufgefüllt.'
                        : 'Online-Modus aktiviert · Es wird auf echte Spieler gewartet.',
                    2800
                );
            });

            // Mode selection
            document.querySelectorAll('.mode-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.mode-option').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-checked', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-checked', 'true');
                    this.selectedMode = btn.dataset.mode;
                    sound.click();
                });
            });

            // Profile avatar grid clicks (delegate)
            document.getElementById('avatar-grid').addEventListener('click', (e) => {
                const target = e.target.closest('.avatar-select-btn');
                if (!target) return;
                sound.click();
                document.querySelectorAll('.avatar-select-btn').forEach(b => b.classList.remove('active'));
                target.classList.add('active');
            });

            // Daily wheel
            document.getElementById('btn-spin-wheel').addEventListener('click', () => this.spinDailyWheel());

            // Play button
            document.getElementById('btn-play').addEventListener('click', () => this.startMatchmaking(this.selectedMode));

            // Matchmaking cancel
            document.getElementById('btn-cancel-matchmaking').addEventListener('click', () => {
                sound.click();
                this.leaveMatchmaking();
            });

            // Leave table
            document.getElementById('btn-leave-table').addEventListener('click', () => this.handleLeaveTablePressed());

            // Chip selection
            document.querySelectorAll('.casino-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    sound.click();
                    const val = parseInt(e.currentTarget.getAttribute('data-val'), 10);
                    this.addUserBet(val);
                });
            });
            document.getElementById('btn-clear-bet').addEventListener('click', () => {
                sound.click();
                this.clearUserBet();
            });
            document.getElementById('btn-deal-cards').addEventListener('click', () => this.handleUserReady());

            // Action buttons
            document.getElementById('btn-action-hit').addEventListener('click', () => this.executeUserAction('HIT'));
            document.getElementById('btn-action-stand').addEventListener('click', () => this.executeUserAction('STAND'));
            document.getElementById('btn-action-double').addEventListener('click', () => this.executeUserAction('DOUBLE'));

            // Admin access
            document.getElementById('btn-admin-access').addEventListener('click', () => {
                sound.click();
                this.inputAdminPwd.value = '';
                this.modalAdminLogin.classList.add('active');
            });
            document.getElementById('close-admin-login').addEventListener('click', () => {
                sound.click(); this.modalAdminLogin.classList.remove('active');
            });
            document.getElementById('close-admin-panel').addEventListener('click', () => {
                sound.click(); this.modalAdminPanel.classList.remove('active');
            });
            document.getElementById('btn-admin-submit-login').addEventListener('click', () => this.handleAdminLogin());
            
            // Admin Actions
            document.getElementById('btn-admin-add-coins').addEventListener('click', () => this.adminAddCoins());
            document.getElementById('btn-admin-reset-leaderboard').addEventListener('click', () => this.adminResetLeaderboard());
            document.getElementById('btn-admin-clear-sessions').addEventListener('click', () => this.adminClearSessions());

            // Window unload: try to remove ourselves from active session so other clients see us leave.
            window.addEventListener('beforeunload', () => this.bestEffortDisconnect());
        }

        // ============================================================
        // ADMIN FUNCTIONS
        // ============================================================
        handleAdminLogin() {
            sound.click();
            const pwd = this.inputAdminPwd.value;
            if (pwd === 'admin12345') {
                this.modalAdminLogin.classList.remove('active');
                this.modalAdminPanel.classList.add('active');
                Toast.success('Admin-Zugriff gewährt!', 2000);
            } else {
                Toast.error('Falsches Passwort!', 2000);
            }
        }

        adminAddCoins() {
            sound.win();
            this.player.coins += 100000;
            this.saveProfile();
            Toast.success('Cheat aktiviert: +100.000 Münzen!', 3000);
        }

        adminResetLeaderboard() {
            sound.click();
            if (!isFirebaseConfigured) {
                Toast.error('Kein Firebase konfiguriert.', 2000);
                return;
            }
            inAppConfirm({
                title: 'Leaderboard leeren?',
                message: 'Willst du wirklich ALLE Spielerdaten aus der Datenbank löschen?',
                okText: 'Ja, leeren',
                cancelText: 'Abbrechen',
                danger: true
            }).then(ok => {
                if (!ok) return;
                db.collection('leaderboard').get().then(snap => {
                    const batch = db.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    return batch.commit();
                }).then(() => {
                    Toast.success('Leaderboard wurde erfolgreich geleert.', 3000);
                    this.renderLeaderboard();
                }).catch(err => {
                    Toast.error('Fehler beim Löschen des Leaderboards.', 3000);
                    console.error(err);
                });
            });
        }

        adminClearSessions() {
            sound.click();
            if (!isFirebaseConfigured) {
                Toast.error('Kein Firebase konfiguriert.', 2000);
                return;
            }
            inAppConfirm({
                title: 'Tische zurücksetzen?',
                message: 'Dies schließt alle aktuell offenen Multiplayer-Tische. Fortfahren?',
                okText: 'Sessions löschen',
                cancelText: 'Abbrechen',
                danger: true
            }).then(ok => {
                if (!ok) return;
                db.collection('sessions').get().then(snap => {
                    const batch = db.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    return batch.commit();
                }).then(() => {
                    Toast.success('Alle Cloud-Sessions wurden gelöscht.', 3000);
                }).catch(err => {
                    Toast.error('Fehler beim Löschen der Sessions.', 3000);
                    console.error(err);
                });
            });
        }

        openProfileModal() {
            sound.click();
            this.inputNickname.value = this.player.name;
            document.querySelectorAll('.avatar-select-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.avatar === this.player.avatar);
            });
            this.modalProfile.classList.add('active');
        }

        saveProfileFromModal() {
            sound.click();
            const newName = (this.inputNickname.value || '').trim();
            if (newName.length > 0) {
                this.player.name = newName.slice(0, 16);
            }
            const activeAvatarBtn = document.querySelector('.avatar-select-btn.active');
            if (activeAvatarBtn) this.player.avatar = activeAvatarBtn.dataset.avatar;
            this.saveProfile();
            this.modalProfile.classList.remove('active');
            Toast.success('Profil aktualisiert');
        }

        // ============================================================
        // UI UPDATE: HUD
        // ============================================================
        updateOnlineModeUI() {
            if (this.offlineMode) {
                this.modeToggle.classList.add('offline');
                this.modeToggleLabel.textContent = 'OFFLINE';
            } else {
                this.modeToggle.classList.remove('offline');
                this.modeToggleLabel.textContent = 'ONLINE';
            }
            const readout = document.getElementById('online-mode-readout');
            if (readout) readout.textContent = this.offlineMode ? 'OFFLINE' : 'ONLINE';
        }

        updateHUD() {
            document.getElementById('hud-player-name').textContent = this.player.name;
            document.getElementById('hud-avatar').innerHTML = avatarSVG(this.player.avatar);
            document.getElementById('hud-rank-name').textContent = this.player.rankName;
            document.getElementById('hud-level-number').textContent = `Lvl ${this.player.level}`;
            const oldCoins = document.getElementById('hud-coins-amount').textContent;
            const newCoins = this.player.coins.toLocaleString('de-DE');
            const coinsEl = document.getElementById('hud-coins-amount');
            coinsEl.textContent = newCoins;
            if (oldCoins !== newCoins) {
                coinsEl.classList.remove('bump');
                void coinsEl.offsetWidth;
                coinsEl.classList.add('bump');
            }

            const curStart = Math.pow(this.player.level - 1, 2) * 100;
            const nextEnd = Math.pow(this.player.level, 2) * 100;
            const range = Math.max(1, nextEnd - curStart);
            const cur = this.player.xp - curStart;
            const pct = Math.min(100, Math.max(0, (cur / range) * 100));
            document.getElementById('hud-xp-fill').style.width = `${pct}%`;
            document.getElementById('hud-xp-text').textContent = `${this.player.xp} / ${nextEnd} XP`;
        }

        // ============================================================
        // LOBBY RENDER
        // ============================================================
        renderLobby() {
            this.updateHUD();

            document.getElementById('stat-hands-played').textContent = this.player.stats.handsPlayed;
            const wr = this.player.stats.handsPlayed > 0
                ? Math.round((this.player.stats.handsWon / this.player.stats.handsPlayed) * 100) : 0;
            document.getElementById('stat-win-rate').textContent = `${wr}%`;
            document.getElementById('stat-blackjack-count').textContent = this.player.stats.blackjacks;
            document.getElementById('stat-highest-chips').textContent =
                this.player.stats.highestChips.toLocaleString('de-DE');

            // Daily wheel timer
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            const diff = now - this.player.lastDailySpin;
            const spinBtn = document.getElementById('btn-spin-wheel');
            const spinTimer = document.getElementById('wheel-timer');
            if (diff < cooldown) {
                spinBtn.disabled = true; spinBtn.classList.add('disabled');
                spinTimer.classList.remove('hidden');
                this.startWheelTimerUpdate();
            } else {
                spinBtn.disabled = false; spinBtn.classList.remove('disabled');
                spinTimer.classList.add('hidden');
                if (this.wheelInterval) { clearInterval(this.wheelInterval); this.wheelInterval = null; }
            }

            this.renderLeaderboard();
        }

        startWheelTimerUpdate() {
            if (this.wheelInterval) clearInterval(this.wheelInterval);
            const update = () => {
                const now = Date.now();
                const cooldown = 24 * 60 * 60 * 1000;
                const diff = now - this.player.lastDailySpin;
                const remaining = cooldown - diff;
                if (remaining <= 0) {
                    clearInterval(this.wheelInterval); this.wheelInterval = null;
                    this.renderLobby();
                } else {
                    const hrs = Math.floor(remaining / (1000 * 60 * 60));
                    const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    const secs = Math.floor((remaining % (1000 * 60)) / 1000);
                    document.getElementById('wheel-timer').textContent =
                        `Nächster Spin in: ${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                }
            };
            update();
            this.wheelInterval = setInterval(update, 1000);
        }

        spinDailyWheel() {
            sound.init();
            const spinBtn = document.getElementById('btn-spin-wheel');
            spinBtn.disabled = true; spinBtn.classList.add('disabled');

            const idx = Math.floor(Math.random() * this.wheelPrizes.length);
            const prize = this.wheelPrizes[idx];
            const degStep = 360 / this.wheelPrizes.length;
            const spinDeg = (360 * 5) + (360 - (idx * degStep));
            const spinner = document.getElementById('wheel-spinner');
            spinner.style.transform = `rotate(${spinDeg}deg)`;

            let ticks = 0;
            const tickInt = setInterval(() => {
                if (ticks < 18) { sound.click(); ticks++; } else { clearInterval(tickInt); }
            }, 180);

            setTimeout(() => {
                this.player.coins += prize.val;
                this.player.lastDailySpin = Date.now();
                this.saveProfile();

                if (prize.val > 0) {
                    sound.win();
                    Toast.success(`+ ${prize.label} Münzen aus dem Bonusrad!`, 3500);
                } else {
                    sound.lose();
                    Toast.error('Niete! Morgen hast du eine neue Chance.', 3500);
                }

                spinner.style.transition = 'none';
                const finalAngle = 360 - (idx * degStep);
                spinner.style.transform = `rotate(${finalAngle}deg)`;
                setTimeout(() => {
                    spinner.style.transition = 'transform 4s cubic-bezier(0.15, 0.85, 0.35, 1)';
                }, 50);
                this.renderLobby();
            }, 4100);
        }

        renderLeaderboard() {
            const board = document.getElementById('leaderboard-list');
            if (!board) return;

            if (isFirebaseConfigured) {
                db.collection('leaderboard').orderBy('coins', 'desc').limit(10).get()
                    .then(snapshot => {
                        const list = [];
                        snapshot.forEach(doc => list.push(doc.data()));

                        // Ensure user is shown even if not in top 10 (use stable userId)
                        const isUserIn = list.some(item => item.userId === this.userId);
                        const userEntry = {
                            userId: this.userId,
                            name: this.player.name,
                            avatar: this.player.avatar,
                            coins: this.player.coins,
                            rank: this.player.rankName,
                            level: this.player.level,
                            __isMe: true
                        };
                        if (!isUserIn) list.push(userEntry);
                        list.sort((a, b) => b.coins - a.coins);

                        this.paintLeaderboard(board, list);
                    })
                    .catch(err => {
                        console.warn('Leaderboard fetch failed:', err);
                        this.renderLocalLeaderboard();
                    });
            } else {
                this.renderLocalLeaderboard();
            }
        }

        renderLocalLeaderboard() {
            const board = document.getElementById('leaderboard-list');
            const list = BOT_POOL.map(b => ({
                userId: 'bot_' + b.name,
                name: b.name,
                avatar: b.avatar,
                coins: b.coins,
                rank: levelToRank(b.level),
                level: b.level,
                __isMe: false
            }));
            list.push({
                userId: this.userId,
                name: this.player.name,
                avatar: this.player.avatar,
                coins: this.player.coins,
                rank: this.player.rankName,
                level: this.player.level,
                __isMe: true
            });
            list.sort((a, b) => b.coins - a.coins);
            this.paintLeaderboard(board, list);
        }

        paintLeaderboard(board, list) {
            board.innerHTML = '';
            list.slice(0, 12).forEach((p, idx) => {
                const isMe = p.__isMe || (p.userId === this.userId);
                const item = document.createElement('div');
                item.className = `leaderboard-item ${isMe ? 'rank-user' : ''}`;
                item.innerHTML = `
                    <div class="lb-pos">${idx + 1}</div>
                    <div class="lb-avatar">${avatarSVG(p.avatar || 'crown')}</div>
                    <div class="lb-details">
                        <span class="lb-name">${escapeHtml(p.name || 'Anonym')}${isMe ? ' (Du)' : ''}</span>
                        <span class="lb-level">${escapeHtml(p.rank || ('Lvl ' + (p.level || 1)))}</span>
                    </div>
                    <div class="lb-coins"><svg class="inline-coin" viewBox="0 0 100 100"><use href="#ico-coin"/></svg> ${(p.coins || 0).toLocaleString('de-DE')}</div>
                `;
                board.appendChild(item);
            });
        }

        startBackgroundSimulations() {
            // Light bot coin fluctuations (so leaderboard looks alive when offline)
            setInterval(() => {
                if (this.currentPhase !== 'LOBBY') return;
                BOT_POOL.forEach(bot => {
                    const shift = Math.floor((Math.random() - 0.48) * 60);
                    bot.coins = Math.max(100, bot.coins + shift);
                });
                if (!isFirebaseConfigured) this.renderLocalLeaderboard();
            }, 9000);
        }

        startOnlineCountUpdater() {
            const refresh = () => {
                const el = document.getElementById('online-now');
                if (!el) return;
                if (!isFirebaseConfigured) { el.textContent = '--'; return; }
                // Count distinct active sessions' seats as a proxy for "online".
                db.collection('sessions').where('status', '!=', 'closed').limit(50).get()
                    .then(snap => {
                        let count = 0;
                        snap.forEach(doc => {
                            const d = doc.data();
                            if (d.seats) Object.values(d.seats).forEach(s => { if (s && s.active && !s.isBot) count++; });
                        });
                        el.textContent = String(count);
                    })
                    .catch(() => { el.textContent = '--'; });
            };
            refresh();
            setInterval(refresh, 10000);
        }

        // ============================================================
        // SCREEN SWITCHING
        // ============================================================
        showScreen(screen) {
            this.screenLobby.classList.remove('active');
            this.screenMatchmaking.classList.remove('active');
            this.screenTable.classList.remove('active');
            screen.classList.add('active');
        }

        // ============================================================
        // MATCHMAKING
        // ============================================================
        startMatchmaking(mode) {
            sound.init();
            sound.click();

            const minBet = 10;
            if (this.player.coins < minBet) {
                Toast.error(`Du brauchst mindestens ${minBet} Münzen, um zu spielen.`, 3500);
                return;
            }

            this.selectedMode = mode;
            const capacity = this.modeCapacity(mode);
            this.currentPhase = 'MATCHMAKING';
            this.outcomeShown = false;
            this.showScreen(this.screenMatchmaking);

            // Render initial slots
            this.renderMatchmakingSlots(capacity, null);

            document.getElementById('matchmaking-title').textContent =
                mode === 'solo' ? 'Solo wird vorbereitet...' : `Suche nach Spielern (${this.modeName(mode)})`;
            document.getElementById('matchmaking-subtitle').textContent =
                `Modus: ${this.modeName(mode)} · Min. Einsatz ${minBet} Münzen`;

            // SOLO: no matchmaking required, jump straight to table.
            if (mode === 'solo') {
                document.getElementById('matchmaking-status-text').textContent = 'Tisch wird vorbereitet...';
                setTimeout(() => {
                    if (this.currentPhase !== 'MATCHMAKING') return;
                    this.createLocalSession(mode);
                    this.enterGameTable();
                }, 700);
                return;
            }

            if (isFirebaseConfigured) {
                this.runCloudMatchmaking(mode);
            } else {
                // No firebase => same as offline mode behaviour
                this.runLocalMatchmaking(mode);
            }
        }

        modeCapacity(mode) {
            return mode === 'solo' ? 1 : mode === 'duo' ? 2 : 3;
        }
        modeName(mode) {
            return mode === 'solo' ? 'Solo' : mode === 'duo' ? 'Duo' : 'Trio';
        }

        renderMatchmakingSlots(capacity, sessionData) {
            const wrap = document.getElementById('mm-player-slots');
            wrap.innerHTML = '';

            for (let i = 0; i < capacity; i++) {
                const slot = document.createElement('div');
                slot.className = 'player-slot empty';
                slot.dataset.idx = String(i);
                slot.innerHTML = `
                    <div class="slot-avatar empty-slot">?</div>
                    <span class="slot-name">Warten...</span>
                    <span class="slot-rank">--</span>
                `;
                wrap.appendChild(slot);
            }

            // Place the user in the first empty slot for visual clarity.
            // If we have session data, paint actual seat occupants.
            if (sessionData && sessionData.seats) {
                const seatIndices = Object.keys(sessionData.seats).map(k => parseInt(k, 10)).sort();
                seatIndices.forEach(idx => {
                    const seat = sessionData.seats[idx];
                    if (!seat || !seat.active) return;
                    this.paintSlot(idx, seat);
                });
            } else {
                // Show user in slot 0
                this.paintSlot(0, {
                    userId: this.userId,
                    name: this.player.name,
                    avatar: this.player.avatar,
                    rank: this.player.rankName,
                    isBot: false,
                    active: true
                });
            }
        }

        paintSlot(idx, seat) {
            const wrap = document.getElementById('mm-player-slots');
            const slot = wrap.querySelector(`.player-slot[data-idx="${idx}"]`);
            if (!slot) return;
            const isMe = seat.userId === this.userId;
            slot.className = 'player-slot active' + (isMe ? ' you' : '');
            slot.innerHTML = `
                ${seat.isBot ? '<span class="slot-bot-tag">BOT</span>' : ''}
                <div class="slot-avatar">${avatarSVG(seat.avatar || 'crown')}</div>
                <span class="slot-name">${escapeHtml(seat.name || 'Spieler')}${isMe ? ' (Du)' : ''}</span>
                <span class="slot-rank">${escapeHtml(seat.rank || ('Lvl ' + (seat.level || 1)))}</span>
            `;
        }

        markSlotLeaving(idx) {
            const wrap = document.getElementById('mm-player-slots');
            const slot = wrap.querySelector(`.player-slot[data-idx="${idx}"]`);
            if (!slot) return;
            slot.classList.add('leaving');
            setTimeout(() => {
                slot.classList.remove('leaving', 'active', 'you');
                slot.classList.add('empty');
                slot.innerHTML = `
                    <div class="slot-avatar empty-slot">?</div>
                    <span class="slot-name">Warten...</span>
                    <span class="slot-rank">--</span>
                `;
            }, 320);
        }

        // ---- LOCAL (no Firebase) matchmaking ----
        createLocalSession(mode) {
            const capacity = this.modeCapacity(mode);
            const seats = {};
            // Seat 0 is user
            seats[0] = this.buildMySeat();
            // Others initially inactive
            for (let i = 1; i < capacity; i++) seats[i] = { active: false };
            this.session = {
                sessionId: 'local_' + Math.random().toString(36).slice(2, 9),
                mode,
                capacity,
                hostId: this.userId,
                status: 'betting',
                seats,
                dealer: { cards: [], score: 0 },
                activeSeatIndex: 0,
                outcomes: {},
                _local: true
            };
            this.isHost = true;
        }

        runLocalMatchmaking(mode) {
            const capacity = this.modeCapacity(mode);
            this.createLocalSession(mode);

            const statusText = document.getElementById('matchmaking-status-text');
            // Render with user in seat 0
            this.renderMatchmakingSlots(capacity, this.session);
            statusText.textContent = 'Verbinde mit lokaler Lobby...';

            if (!this.offlineMode) {
                // Without Firebase we can't actually find real players; tell user.
                statusText.textContent = 'Online-Matchmaking nicht verfügbar (Firebase nicht konfiguriert). Aktiviere Offline-Modus.';
                Toast.error('Firebase ist nicht konfiguriert. Aktiviere Offline-Modus oder richte Firebase ein.', 4500);
                return;
            }

            // Offline mode ON: fill with bots progressively
            this.fillLocalBotsAndStart(mode, statusText, capacity);
        }

        fillLocalBotsAndStart(mode, statusText, capacity) {
            const usedNames = [this.player.name];
            let nextIdx = 1;

            const fillNext = () => {
                if (this.currentPhase !== 'MATCHMAKING') return;
                if (nextIdx >= capacity) {
                    statusText.textContent = 'Spiel startet...';
                    document.getElementById('matchmaking-title').textContent = 'BEREIT!';
                    setTimeout(() => { if (this.currentPhase === 'MATCHMAKING') this.enterGameTable(); }, 700);
                    return;
                }
                const botSeat = buildBotSeat(usedNames);
                usedNames.push(botSeat.name);
                this.session.seats[nextIdx] = { ...botSeat, active: true };
                this.paintSlot(nextIdx, this.session.seats[nextIdx]);
                statusText.textContent = `${botSeat.name} ist beigetreten.`;
                sound.click();
                nextIdx++;
                this.botFillTimeout = setTimeout(fillNext, 900);
            };
            this.botFillTimeout = setTimeout(fillNext, 700);
        }

        // ---- CLOUD matchmaking ----
        runCloudMatchmaking(mode) {
            const capacity = this.modeCapacity(mode);
            const statusText = document.getElementById('matchmaking-status-text');
            statusText.textContent = 'Verbindung zur Cloud-Lobby...';

            // Try to find an existing waiting session of the same mode with free seats.
            const tryFindAndJoin = () => {
                db.collection('sessions')
                    .where('mode', '==', mode)
                    .where('status', '==', 'waiting')
                    .limit(10)
                    .get()
                    .then(snap => {
                        if (this.currentPhase !== 'MATCHMAKING') return;
                        let joinedDoc = null;
                        snap.forEach(doc => {
                            if (joinedDoc) return;
                            const data = doc.data();
                            if (!data.seats || data.capacity !== capacity) return;
                            const seatKeys = Object.keys(data.seats);
                            const activeCount = seatKeys.filter(k => data.seats[k] && data.seats[k].active).length;
                            if (activeCount < capacity) joinedDoc = doc;
                        });

                        if (joinedDoc) this.joinCloudSession(joinedDoc);
                        else this.createCloudSession(mode);
                    })
                    .catch(err => {
                        console.warn('Matchmaking query failed:', err);
                        statusText.textContent = 'Cloud nicht erreichbar - lokaler Modus.';
                        Toast.error('Cloud nicht erreichbar. Spiele lokal.', 3500);
                        this.runLocalMatchmaking(mode);
                    });
            };

            tryFindAndJoin();
        }

        createCloudSession(mode) {
            this.isHost = true;
            const capacity = this.modeCapacity(mode);
            const sessionId = 'session_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
            const seats = {};
            seats[0] = this.buildMySeat();
            for (let i = 1; i < capacity; i++) seats[i] = { active: false };

            const data = {
                sessionId, mode, capacity,
                hostId: this.userId,
                status: 'waiting',
                seats,
                dealer: { cards: [], score: 0 },
                activeSeatIndex: 0,
                outcomes: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            this.sessionDocRef = db.collection('sessions').doc(sessionId);
            this.sessionDocRef.set(data).then(() => {
                this.subscribeSession();
                this.scheduleBotFillIfOffline();
            }).catch(err => {
                console.warn('createCloudSession failed:', err);
                Toast.error('Cloud-Session konnte nicht erstellt werden.', 3500);
                this.runLocalMatchmaking(mode);
            });
        }

        joinCloudSession(docSnapshot) {
            this.isHost = false;
            this.sessionDocRef = docSnapshot.ref;
            const ref = this.sessionDocRef;

            // Atomic join via transaction
            db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('session missing');
                const data = snap.data();
                if (data.status !== 'waiting') throw new Error('not_waiting');

                const seats = data.seats || {};
                const capacity = data.capacity;
                let freeIdx = -1;
                for (let i = 0; i < capacity; i++) {
                    if (!seats[i] || !seats[i].active) { freeIdx = i; break; }
                }
                if (freeIdx === -1) throw new Error('full');

                seats[freeIdx] = this.buildMySeat();
                tx.update(ref, {
                    seats,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }).then(() => {
                this.subscribeSession();
            }).catch(err => {
                if (err && err.message === 'full') {
                    // Try again to find another or create
                    this.runCloudMatchmaking(this.selectedMode);
                } else {
                    console.warn('joinCloudSession transaction failed:', err);
                    Toast.error('Verbindung fehlgeschlagen, versuche es erneut.', 3500);
                    setTimeout(() => this.runCloudMatchmaking(this.selectedMode), 800);
                }
            });
        }

        buildMySeat() {
            return {
                userId: this.userId,
                name: this.player.name,
                avatar: this.player.avatar,
                coins: this.player.coins,
                rank: this.player.rankName,
                level: this.player.level,
                cards: [],
                score: 0,
                bet: 0,
                stand: false,
                bust: false,
                isBot: false,
                active: true,
                ready: false,
                joinedAt: Date.now()
            };
        }

        subscribeSession() {
            if (this.sessionListener) { this.sessionListener(); this.sessionListener = null; }
            this.sessionListener = this.sessionDocRef.onSnapshot(doc => {
                if (!doc.exists) {
                    this.handleSessionClosed('Tisch wurde geschlossen.');
                    return;
                }
                const data = doc.data();
                this.session = data;
                this.handleSessionUpdate(data);
            }, err => {
                console.warn('Session listener error:', err);
            });
        }

        scheduleBotFillIfOffline() {
            if (!this.isHost) return;
            if (this.botFillTimeout) clearTimeout(this.botFillTimeout);

            // If offline mode is OFF, never fill bots. Wait indefinitely.
            // If offline mode is ON, fill empty seats after a short delay.
            const fillDelay = this.offlineMode ? 1500 : null;
            if (!fillDelay) return;

            this.botFillTimeout = setTimeout(() => this.fillCloudSessionWithBots(), fillDelay);
        }

        fillCloudSessionWithBots() {
            if (!this.isHost || !this.sessionDocRef) return;
            this.sessionDocRef.get().then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                if (data.status !== 'waiting') return;

                const seats = data.seats || {};
                const cap = data.capacity;
                const usedNames = [];
                for (let i = 0; i < cap; i++) {
                    if (seats[i] && seats[i].active) usedNames.push(seats[i].name);
                }
                let changed = false;
                for (let i = 0; i < cap; i++) {
                    if (!seats[i] || !seats[i].active) {
                        const bot = buildBotSeat(usedNames);
                        seats[i] = { ...bot, active: true };
                        usedNames.push(bot.name);
                        changed = true;
                    }
                }
                if (!changed) return;
                this.sessionDocRef.update({
                    seats,
                    status: 'betting',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        }

        handleSessionUpdate(data) {
            // Build matchmaking visual from data while still in matchmaking
            if (this.currentPhase === 'MATCHMAKING') {
                this.renderMatchmakingSlots(data.capacity, data);

                // Check whether all seats are active
                let activeCount = 0;
                for (let i = 0; i < data.capacity; i++) {
                    if (data.seats[i] && data.seats[i].active) activeCount++;
                }
                const statusText = document.getElementById('matchmaking-status-text');
                if (activeCount >= data.capacity) {
                    statusText.textContent = 'Alle Spieler bereit! Spiel startet...';
                    document.getElementById('matchmaking-title').textContent = 'BEREIT!';
                    if (this.isHost && data.status === 'waiting') {
                        // Host transitions to betting now that table is full.
                        this.sessionDocRef.update({
                            status: 'betting',
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                    setTimeout(() => {
                        if (this.currentPhase === 'MATCHMAKING') this.enterGameTable();
                    }, 900);
                } else {
                    // Show real player names that are present
                    const presentNames = [];
                    for (let i = 0; i < data.capacity; i++) {
                        if (data.seats[i] && data.seats[i].active && data.seats[i].userId !== this.userId) {
                            presentNames.push(data.seats[i].name + (data.seats[i].isBot ? ' (Bot)' : ''));
                        }
                    }
                    if (presentNames.length) {
                        statusText.textContent = `${presentNames.join(', ')} an Bord. Warte auf weitere...`;
                    } else if (this.offlineMode) {
                        statusText.textContent = 'Plätze werden mit Bots aufgefüllt...';
                    } else {
                        statusText.textContent = 'Warte auf echte Spieler...';
                    }
                }
                return;
            }

            // In-game updates
            if (this.currentPhase !== 'LOBBY' && this.currentPhase !== 'MATCHMAKING') {
                this.syncTableFromSession(data);
            }
        }

        handleSessionClosed(message) {
            if (this.sessionListener) { this.sessionListener(); this.sessionListener = null; }
            this.sessionDocRef = null;
            this.session = null;
            this.isHost = false;
            if (this.currentPhase !== 'LOBBY') {
                Toast.info(message || 'Tisch geschlossen.', 3000);
                this.returnToLobby();
            }
        }

        leaveMatchmaking() {
            if (this.botFillTimeout) { clearTimeout(this.botFillTimeout); this.botFillTimeout = null; }
            this.bestEffortDisconnect();
            this.session = null;
            this.isHost = false;
            this.sessionDocRef = null;
            this.currentPhase = 'LOBBY';
            this.showScreen(this.screenLobby);
            this.renderLobby();
        }

        bestEffortDisconnect() {
            try {
                if (this.sessionListener) { this.sessionListener(); this.sessionListener = null; }
                if (!this.sessionDocRef) return;
                const ref = this.sessionDocRef;
                // Try a synchronous-style update via transaction
                db.runTransaction(async (tx) => {
                    const snap = await tx.get(ref);
                    if (!snap.exists) return;
                    const d = snap.data();
                    const seats = d.seats || {};
                    let myIdx = -1;
                    for (let i = 0; i < d.capacity; i++) {
                        if (seats[i] && seats[i].active && seats[i].userId === this.userId) { myIdx = i; break; }
                    }
                    if (myIdx === -1) return;

                    seats[myIdx] = { active: false };

                    // If we are host, transfer host to first real player; if none, close session.
                    let updates = {
                        seats,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (d.hostId === this.userId) {
                        let newHost = null;
                        for (let i = 0; i < d.capacity; i++) {
                            if (seats[i] && seats[i].active && !seats[i].isBot && seats[i].userId !== this.userId) {
                                newHost = seats[i].userId; break;
                            }
                        }
                        if (newHost) {
                            updates.hostId = newHost;
                        } else {
                            updates.status = 'closed';
                        }
                    }

                    // If session has only bots left, close it.
                    const anyReal = Object.values(seats).some(s => s && s.active && !s.isBot);
                    if (!anyReal) updates.status = 'closed';

                    tx.update(ref, updates);
                }).catch(() => { /* best effort */ });
            } catch (e) { /* ignore */ }
        }

        // ============================================================
        // GAME TABLE
        // ============================================================
        enterGameTable() {
            this.currentPhase = 'BETTING';
            this.outcomeShown = false;
            this.showScreen(this.screenTable);
            this.renderSeats();
            this.updateTableHeader();

            // Update controls
            document.getElementById('controls-betting').classList.remove('hidden');
            document.getElementById('controls-playing').classList.add('hidden');
            document.getElementById('controls-waiting').classList.add('hidden');

            this.updateUserBetUI();

            if (!this.session._local) {
                if (this.session) this.syncTableFromSession(this.session);
            }
            // Local mode: just sits in betting phase until user clicks "Karten geben"
        }

        modeName(mode) {
            return mode === 'solo' ? 'Solo' : mode === 'duo' ? 'Duo' : 'Trio';
        }

        updateTableHeader() {
            const m = this.session.mode || this.selectedMode;
            document.getElementById('table-info-label').textContent = `PLAY · ${this.modeName(m)} · Min Bet: 10`;
            document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
        }

        // Render seats based on session.capacity; user's seat first (visually).
        renderSeats() {
            const capacity = this.session.capacity;
            this.seatsContainer.dataset.mode = this.session.mode;
            this.seatsContainer.innerHTML = '';

            // Build display order: my seat first, then others in seat index order.
            let mySeatIdx = -1;
            for (let i = 0; i < capacity; i++) {
                const s = this.session.seats[i];
                if (s && s.active && s.userId === this.userId) { mySeatIdx = i; break; }
            }
            const order = [];
            if (mySeatIdx !== -1) order.push(mySeatIdx);
            for (let i = 0; i < capacity; i++) if (i !== mySeatIdx) order.push(i);

            order.forEach(idx => {
                const seat = this.session.seats[idx];
                if (!seat || !seat.active) return;

                const isMe = seat.userId === this.userId;
                const seatEl = document.createElement('div');
                seatEl.className = 'seat joining' + (isMe ? ' you' : '');
                seatEl.dataset.seatIdx = String(idx);

                seatEl.innerHTML = `
                    <div class="hand-container" data-role="hand"></div>
                    <div class="hand-value hidden" data-role="score">0</div>
                    <div class="betting-circle ${isMe ? 'clickable-bet' : ''}" data-role="bet-circle">
                        ${isMe ? '<div class="chip-stack" data-role="chip-stack"></div>' : ''}
                        <span class="bet-value" data-role="bet-value">0</span>
                    </div>
                    <div class="seat-profile">
                        <div class="seat-avatar">${avatarSVG(seat.avatar || 'crown')}</div>
                        <span class="seat-name">${escapeHtml(seat.name || 'Spieler')}${isMe ? ' (Du)' : ''}${seat.isBot ? ' [Bot]' : ''}</span>
                        <span class="seat-coins"><svg class="inline-coin" viewBox="0 0 100 100"><use href="#ico-coin"/></svg> ${(seat.coins || 0).toLocaleString('de-DE')}</span>
                        <div class="action-bubble" data-role="bubble"></div>
                    </div>
                `;
                this.seatsContainer.appendChild(seatEl);

                if (isMe) {
                    seatEl.querySelector('[data-role="bet-circle"]').addEventListener('click', () => this.addUserBet(10));
                }
            });
        }

        // Helper to update seat UI from a seat object
        updateSeatUI(idx, seat, isMyTurn) {
            const seatEl = this.seatsContainer.querySelector(`.seat[data-seat-idx="${idx}"]`);
            if (!seatEl) return;
            const handEl = seatEl.querySelector('[data-role="hand"]');
            const scoreEl = seatEl.querySelector('[data-role="score"]');
            const betValueEl = seatEl.querySelector('[data-role="bet-value"]');
            const coinsEl = seatEl.querySelector('.seat-coins');

            // Cards
            const cardsArr = (seat.cards || []).map(c => Card.fromPlain(c));
            // Avoid full rebuild if same length - but to keep cards aligned to data, rebuild when count changes
            if (handEl.childElementCount !== cardsArr.length) {
                handEl.innerHTML = '';
                cardsArr.forEach(c => handEl.appendChild(c.render()));
            }

            // Score
            const score = seat.score || calcHandScore(cardsArr);
            scoreEl.textContent = score;
            scoreEl.classList.toggle('hidden', cardsArr.length === 0);
            if (seat.bust) {
                scoreEl.style.borderColor = 'var(--danger)';
                scoreEl.style.color = 'var(--danger)';
            } else {
                scoreEl.style.borderColor = 'var(--gold)';
                scoreEl.style.color = '#fff';
            }

            // Bet
            betValueEl.textContent = seat.bet || 0;

            // Coins
            coinsEl.innerHTML = `<svg class="inline-coin" viewBox="0 0 100 100"><use href="#ico-coin"/></svg> ${(seat.coins || 0).toLocaleString('de-DE')}`;

            // Active turn highlight
            seatEl.classList.toggle('active-turn', !!isMyTurn);

            // For the user, also paint the chip stack
            if (seat.userId === this.userId) {
                const stack = seatEl.querySelector('[data-role="chip-stack"]');
                if (stack) this.paintChipStack(stack, seat.bet || 0);
            }
        }

        paintChipStack(stack, betAmount) {
            stack.innerHTML = '';
            let temp = betAmount;
            const vals = [1000, 500, 100, 50, 10];
            let offset = 0;
            vals.forEach(v => {
                const cnt = Math.floor(temp / v);
                temp %= v;
                for (let i = 0; i < cnt && offset < 12; i++) {
                    const chip = document.createElement('div');
                    chip.className = `stacked-chip chip-${v}`;
                    chip.style.bottom = `${offset * 3}px`;
                    chip.style.left = `${offset * 0.5}px`;
                    stack.appendChild(chip);
                    offset++;
                }
            });
        }

        renderDealer(seat, hideDownCard) {
            const dealerHand = document.getElementById('dealer-hand');
            const dealerScore = document.getElementById('dealer-hand-score');

            const cardsArr = (seat.cards || []).map(c => Card.fromPlain(c));
            // Only rebuild on length change
            if (dealerHand.childElementCount !== cardsArr.length) {
                dealerHand.innerHTML = '';
                cardsArr.forEach((c, i) => {
                    const isDown = hideDownCard && i === 1;
                    dealerHand.appendChild(c.render(isDown));
                });
            } else {
                // Toggle face-up state of card #1 if needed
                const second = dealerHand.children[1];
                if (second) {
                    const wantsBack = !!(hideDownCard);
                    const hasBack = second.classList.contains('card-back');
                    if (wantsBack !== hasBack) {
                        dealerHand.innerHTML = '';
                        cardsArr.forEach((c, i) => {
                            const isDown = hideDownCard && i === 1;
                            dealerHand.appendChild(c.render(isDown));
                        });
                    }
                }
            }

            if (cardsArr.length === 0) {
                dealerScore.classList.add('hidden');
            } else {
                dealerScore.classList.remove('hidden');
                if (hideDownCard && cardsArr.length >= 2) {
                    // Show only first card value
                    const first = cardsArr[0];
                    dealerScore.textContent = first.rank === 'A' ? 11 : first.value;
                } else {
                    dealerScore.textContent = seat.score || calcHandScore(cardsArr);
                }
            }
        }

        // ============================================================
        // BETTING
        // ============================================================
        addUserBet(amount) {
            if (this.currentPhase !== 'BETTING') return;
            const mySeat = this.getMySeat();
            if (!mySeat) return;
            const projected = (mySeat.bet || 0) + amount;
            if (projected > this.player.coins) {
                Toast.error('Nicht genug Münzen!', 2200);
                return;
            }
            mySeat.bet = projected;
            sound.chipDrop();

            // Update local UI immediately for snappy feedback
            this.updateUserBetUI();

            // Persist
            this.persistMySeatBet(mySeat.bet);
        }

        clearUserBet() {
            if (this.currentPhase !== 'BETTING') return;
            const mySeat = this.getMySeat();
            if (!mySeat) return;
            mySeat.bet = 0;
            this.updateUserBetUI();
            this.persistMySeatBet(0);
        }

        persistMySeatBet(amount) {
            if (this.session._local) return;
            if (!this.sessionDocRef) return;
            const idx = this.getMySeatIndex();
            if (idx === -1) return;
            // Throttle: keep last value with debounce
            if (this._betWriteTimeout) clearTimeout(this._betWriteTimeout);
            this._betWriteTimeout = setTimeout(() => {
                this.sessionDocRef.get().then(doc => {
                    if (!doc.exists) return;
                    const data = doc.data();
                    if (!data.seats[idx] || !data.seats[idx].active) return;
                    data.seats[idx].bet = amount;
                    data.seats[idx].ready = (amount >= 10);
                    this.sessionDocRef.update({
                        [`seats.${idx}.bet`]: amount,
                        [`seats.${idx}.ready`]: (amount >= 10),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
            }, 180);
        }

        updateUserBetUI() {
            const mySeat = this.getMySeat();
            const idx = this.getMySeatIndex();
            if (idx !== -1 && mySeat) this.updateSeatUI(idx, mySeat, this.session.activeSeatIndex === idx);

            const btnDeal = document.getElementById('btn-deal-cards');
            const minBet = 10;
            if (mySeat && mySeat.bet >= minBet) {
                btnDeal.classList.remove('disabled');
                btnDeal.disabled = false;
                if (this.session._local) {
                    btnDeal.textContent = 'Karten geben';
                } else if (this.isHost) {
                    btnDeal.textContent = 'Karten geben (Host)';
                } else {
                    btnDeal.textContent = 'Bereit';
                }
            } else {
                btnDeal.classList.add('disabled');
                btnDeal.disabled = true;
                btnDeal.textContent = 'Einsatz setzen';
            }
        }

        getMySeat() {
            if (!this.session) return null;
            for (let i = 0; i < this.session.capacity; i++) {
                const s = this.session.seats[i];
                if (s && s.active && s.userId === this.userId) return s;
            }
            return null;
        }
        getMySeatIndex() {
            if (!this.session) return -1;
            for (let i = 0; i < this.session.capacity; i++) {
                const s = this.session.seats[i];
                if (s && s.active && s.userId === this.userId) return i;
            }
            return -1;
        }

        handleUserReady() {
            const mySeat = this.getMySeat();
            if (!mySeat || mySeat.bet < 10) {
                Toast.error('Mindesteinsatz: 10 Münzen.', 2000);
                return;
            }

            if (this.session._local) {
                // Local: deal cards immediately (we are the only real player)
                this.startLocalDealing();
                return;
            }

            // Cloud: mark ready
            mySeat.ready = true;
            const idx = this.getMySeatIndex();
            this.sessionDocRef.update({
                [`seats.${idx}.ready`]: true,
                [`seats.${idx}.bet`]: mySeat.bet,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Host checks if all are ready -> start dealing
            if (this.isHost) {
                this.maybeStartCloudDealing();
            } else {
                Toast.info('Bereit. Warte auf andere Spieler...', 2500);
            }
        }

        maybeStartCloudDealing() {
            if (!this.isHost || !this.sessionDocRef) return;
            this.sessionDocRef.get().then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                if (data.status !== 'betting') return;

                // For real players, require them to be ready. For bots, auto-bet & auto-ready.
                const seats = data.seats || {};
                let allReady = true;
                for (let i = 0; i < data.capacity; i++) {
                    const s = seats[i];
                    if (!s || !s.active) continue;
                    if (s.isBot) {
                        if (!s.ready || !s.bet) {
                            // Auto bet for bot
                            const bet = Math.max(10, Math.floor((10 + Math.random() * 90) / 10) * 10);
                            seats[i].bet = Math.min(bet, s.coins || 1000);
                            seats[i].ready = true;
                        }
                    } else {
                        if (!s.ready) allReady = false;
                    }
                }
                if (!allReady) {
                    // Still write bot updates
                    this.sessionDocRef.update({ seats, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    return;
                }
                // All ready -> start dealing
                this.startCloudDealing(data, seats);
            });
        }

        startCloudDealing(data, seats) {
            // Deduct bets from each active seat's coins
            for (let i = 0; i < data.capacity; i++) {
                const s = seats[i];
                if (!s || !s.active) continue;
                s.coins = Math.max(0, (s.coins || 0) - (s.bet || 0));
                s.cards = [];
                s.score = 0;
                s.stand = false;
                s.bust = false;
            }
            data.dealer = { cards: [], score: 0 };

            // Deal 2 cards each, then dealer 2 (one is hidden visually)
            const drawn = (n) => {
                const out = [];
                for (let i = 0; i < n; i++) out.push(this.deck.draw().toPlain());
                return out;
            };
            for (let i = 0; i < data.capacity; i++) {
                if (seats[i] && seats[i].active) seats[i].cards = drawn(2);
            }
            data.dealer.cards = drawn(2);

            // Compute scores
            for (let i = 0; i < data.capacity; i++) {
                if (seats[i] && seats[i].active) {
                    seats[i].score = calcHandScore(seats[i].cards.map(c => Card.fromPlain(c)));
                }
            }
            data.dealer.score = calcHandScore(data.dealer.cards.map(c => Card.fromPlain(c)));

            // Find first active seat for turn order
            let firstActive = 0;
            for (let i = 0; i < data.capacity; i++) {
                if (seats[i] && seats[i].active) { firstActive = i; break; }
            }

            this.sessionDocRef.update({
                seats,
                dealer: data.dealer,
                status: 'playing',
                activeSeatIndex: firstActive,
                outcomes: {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        startLocalDealing() {
            this.currentPhase = 'DEALING';
            const seats = this.session.seats;

            // Random bot bets
            for (let i = 0; i < this.session.capacity; i++) {
                const s = seats[i];
                if (!s || !s.active) continue;
                if (s.isBot) {
                    const bet = Math.max(10, Math.floor((10 + Math.random() * 90) / 10) * 10);
                    s.bet = Math.min(bet, s.coins || 1000);
                }
            }

            // Deduct
            for (let i = 0; i < this.session.capacity; i++) {
                const s = seats[i];
                if (!s || !s.active) continue;
                s.coins = Math.max(0, (s.coins || 0) - (s.bet || 0));
                s.cards = [];
                s.score = 0;
                s.stand = false;
                s.bust = false;
            }
            // For the user's seat, also deduct from player.coins
            const mySeat = this.getMySeat();
            if (mySeat) {
                this.player.coins -= mySeat.bet;
                mySeat.coins = this.player.coins;
                this.updateHUD();
            }

            this.session.dealer = { cards: [], score: 0 };

            document.getElementById('controls-betting').classList.add('hidden');
            document.getElementById('controls-waiting').classList.remove('hidden');
            document.getElementById('waiting-text').textContent = 'Karten werden ausgeteilt...';

            // Animated deal: 2 cards each (player(s), then dealer up, then player(s) second card, then dealer down)
            const order = [];
            const activeIdxs = [];
            for (let i = 0; i < this.session.capacity; i++) {
                if (seats[i] && seats[i].active) activeIdxs.push(i);
            }
            activeIdxs.forEach(i => order.push({ to: 'seat', idx: i }));
            order.push({ to: 'dealer', up: true });
            activeIdxs.forEach(i => order.push({ to: 'seat', idx: i }));
            order.push({ to: 'dealer', up: false });

            let q = 0;
            const step = () => {
                if (q >= order.length) {
                    // Update scores, transition to PLAYING
                    activeIdxs.forEach(i => {
                        seats[i].score = calcHandScore(seats[i].cards.map(c => Card.fromPlain(c)));
                    });
                    this.session.dealer.score = calcHandScore(this.session.dealer.cards.map(c => Card.fromPlain(c)));

                    this.session.status = 'playing';
                    this.session.activeSeatIndex = activeIdxs[0];
                    this.currentPhase = 'PLAYING';
                    this.renderTableFromState();
                    this.processTurn();
                    return;
                }
                const o = order[q++];
                sound.cardSwoosh();
                if (o.to === 'seat') {
                    const card = this.deck.draw();
                    seats[o.idx].cards.push(card.toPlain());
                    // partial render
                    seats[o.idx].score = calcHandScore(seats[o.idx].cards.map(c => Card.fromPlain(c)));
                    this.updateSeatUI(o.idx, seats[o.idx], false);
                } else {
                    const card = this.deck.draw();
                    this.session.dealer.cards.push(card.toPlain());
                    this.renderDealer(this.session.dealer, true);
                }
                document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
                setTimeout(step, 420);
            };
            step();
        }

        // ============================================================
        // SYNC TABLE FROM SESSION (cloud)
        // ============================================================
        syncTableFromSession(data) {
            this.session = data;
            // Render seats container with current active seats
            // If the structure changed (someone left), re-render seats container.
            const renderedCount = this.seatsContainer.querySelectorAll('.seat').length;
            const expectedCount = (() => {
                let n = 0;
                for (let i = 0; i < data.capacity; i++) if (data.seats[i] && data.seats[i].active) n++;
                return n;
            })();

            // Detect leavers: seats currently rendered but no longer active
            const rendered = Array.from(this.seatsContainer.querySelectorAll('.seat'));
            const renderedIdxSet = new Set(rendered.map(e => parseInt(e.dataset.seatIdx, 10)));
            let leaverIdx = null;
            renderedIdxSet.forEach(idx => {
                const s = data.seats[idx];
                if (!s || !s.active) leaverIdx = idx;
            });

            if (leaverIdx !== null) {
                const seatEl = this.seatsContainer.querySelector(`.seat[data-seat-idx="${leaverIdx}"]`);
                if (seatEl) {
                    seatEl.classList.add('leaving');
                    Toast.info('Ein Spieler hat den Tisch verlassen.', 2500);
                    setTimeout(() => { try { this.renderSeats(); this.syncTableUI(); } catch (e) {} }, 350);
                    return;
                }
            }

            if (renderedCount !== expectedCount || renderedCount === 0) {
                this.renderSeats();
            }
            this.syncTableUI();
            this.handleStatusTransition(data);
        }

        renderTableFromState() {
            this.renderSeats();
            this.syncTableUI();
        }

        syncTableUI() {
            if (!this.session) return;
            const data = this.session;

            const showDealerDown = (data.status === 'playing' || data.status === 'betting' || data.status === 'dealing');
            this.renderDealer(data.dealer || { cards: [], score: 0 }, showDealerDown);

            for (let i = 0; i < data.capacity; i++) {
                const s = data.seats[i];
                if (!s || !s.active) continue;
                const isMyTurn = data.activeSeatIndex === i && data.status === 'playing';
                this.updateSeatUI(i, s, isMyTurn);
            }

            // Update controls
            this.updateUserBetUI();

            if (data.status === 'playing') {
                const myIdx = this.getMySeatIndex();
                if (data.activeSeatIndex === myIdx) {
                    document.getElementById('controls-betting').classList.add('hidden');
                    document.getElementById('controls-waiting').classList.add('hidden');
                    document.getElementById('controls-playing').classList.remove('hidden');
                    document.getElementById('action-instruction').textContent = 'Du bist an der Reihe!';
                    // Enable/disable double
                    const mySeat = this.getMySeat();
                    const btnDouble = document.getElementById('btn-action-double');
                    const canDouble = mySeat && mySeat.cards && mySeat.cards.length === 2 && this.player.coins >= mySeat.bet;
                    btnDouble.disabled = !canDouble;
                    btnDouble.classList.toggle('disabled', !canDouble);
                } else {
                    document.getElementById('controls-betting').classList.add('hidden');
                    document.getElementById('controls-playing').classList.add('hidden');
                    document.getElementById('controls-waiting').classList.remove('hidden');
                    const activeSeat = data.seats[data.activeSeatIndex];
                    document.getElementById('waiting-text').textContent =
                        `Warte: ${activeSeat ? activeSeat.name : 'Spieler'} ist an der Reihe...`;
                }
            } else if (data.status === 'betting') {
                document.getElementById('controls-betting').classList.remove('hidden');
                document.getElementById('controls-playing').classList.add('hidden');
                document.getElementById('controls-waiting').classList.add('hidden');
            } else if (data.status === 'dealer' || data.status === 'dealing') {
                document.getElementById('controls-betting').classList.add('hidden');
                document.getElementById('controls-playing').classList.add('hidden');
                document.getElementById('controls-waiting').classList.remove('hidden');
                document.getElementById('waiting-text').textContent =
                    data.status === 'dealing' ? 'Karten werden ausgeteilt...' : 'Dealer zieht Karten...';
            }
            document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
        }

        handleStatusTransition(data) {
            if (data.status === 'playing') {
                if (this.currentPhase !== 'PLAYING') {
                    this.currentPhase = 'PLAYING';
                    this.renderTableFromState();
                }
                if (this.isHost) this.maybeRunHostBotsTurn();
            } else if (data.status === 'dealer') {
                if (this.currentPhase !== 'DEALER') {
                    this.currentPhase = 'DEALER';
                    if (this.isHost) this.runHostDealerSequence();
                }
            } else if (data.status === 'outcome' && this.currentPhase !== 'OUTCOME') {
                this.currentPhase = 'OUTCOME';
                this.showOutcomeBanner(data);
            } else if (data.status === 'closed') {
                this.handleSessionClosed('Tisch wurde geschlossen.');
            } else if (data.status === 'betting') {
                if (this.currentPhase !== 'BETTING') this.currentPhase = 'BETTING';
                // Host checks if everyone ready and starts dealing
                if (this.isHost) this.maybeStartCloudDealing();
            }
        }

        // ============================================================
        // PLAYING (turn loop)
        // ============================================================
        processTurn() {
            if (this.session._local) return this.processLocalTurn();
            // Cloud turn handling is driven by snapshot updates + host orchestration
            if (this.isHost) this.maybeRunHostBotsTurn();
        }

        processLocalTurn() {
            const seats = this.session.seats;
            const idx = this.session.activeSeatIndex;
            const seat = seats[idx];
            if (!seat || !seat.active || seat.stand || seat.bust) {
                this.advanceLocalTurn();
                return;
            }
            // Recompute score from current cards
            seat.score = calcHandScore((seat.cards || []).map(c => Card.fromPlain(c)));

            if (seat.score >= 21) {
                if (seat.score > 21) seat.bust = true;
                seat.stand = true;
                this.updateSeatUI(idx, seat, false);
                setTimeout(() => this.advanceLocalTurn(), 800);
                return;
            }

            if (seat.userId === this.userId) {
                // User's turn
                this.syncTableUI();
                document.getElementById('controls-waiting').classList.add('hidden');
                document.getElementById('controls-playing').classList.remove('hidden');
                document.getElementById('action-instruction').textContent = 'Du bist an der Reihe!';
                const btnDouble = document.getElementById('btn-action-double');
                const canDouble = seat.cards.length === 2 && this.player.coins >= seat.bet;
                btnDouble.disabled = !canDouble;
                btnDouble.classList.toggle('disabled', !canDouble);
                return;
            }

            // Bot turn
            document.getElementById('controls-playing').classList.add('hidden');
            document.getElementById('controls-waiting').classList.remove('hidden');
            document.getElementById('waiting-text').textContent = `${seat.name} überlegt...`;
            this.runLocalBotTurn(idx, seat);
        }

        runLocalBotTurn(idx, seat) {
            const dealerUp = this.session.dealer.cards[0];
            const dealerVal = dealerUp ? (dealerUp.value === 11 ? 11 : dealerUp.value) : 10;

            const decide = () => {
                seat.score = calcHandScore(seat.cards.map(c => Card.fromPlain(c)));
                this.updateSeatUI(idx, seat, true);

                if (seat.score > 21) { seat.bust = true; this.showBubble(idx, 'BUST!', 'bust'); setTimeout(() => this.advanceLocalTurn(), 900); return; }
                if (seat.score === 21) { seat.stand = true; this.showBubble(idx, '21!', 'bj'); setTimeout(() => this.advanceLocalTurn(), 900); return; }

                let action = 'STAND';
                if (seat.score <= 11) {
                    action = 'HIT';
                    if ((seat.score === 10 || seat.score === 11) && dealerVal <= 9 && seat.cards.length === 2 && seat.coins >= seat.bet) action = 'DOUBLE';
                } else if (seat.score === 12) {
                    action = (dealerVal >= 4 && dealerVal <= 6) ? 'STAND' : 'HIT';
                } else if (seat.score >= 13 && seat.score <= 16) {
                    action = (dealerVal <= 6) ? 'STAND' : 'HIT';
                }

                if (action === 'HIT') {
                    this.showBubble(idx, 'HIT');
                    this.botTurnTimeout = setTimeout(() => {
                        const c = this.deck.draw();
                        seat.cards.push(c.toPlain());
                        sound.cardSwoosh();
                        this.updateSeatUI(idx, seat, true);
                        document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
                        decide();
                    }, 900);
                } else if (action === 'DOUBLE') {
                    this.showBubble(idx, 'DOUBLE');
                    seat.coins -= seat.bet; seat.bet *= 2;
                    this.updateSeatUI(idx, seat, true);
                    sound.chipDrop();
                    this.botTurnTimeout = setTimeout(() => {
                        const c = this.deck.draw();
                        seat.cards.push(c.toPlain());
                        sound.cardSwoosh();
                        seat.stand = true;
                        seat.score = calcHandScore(seat.cards.map(c => Card.fromPlain(c)));
                        if (seat.score > 21) seat.bust = true;
                        this.updateSeatUI(idx, seat, true);
                        document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
                        setTimeout(() => this.advanceLocalTurn(), 900);
                    }, 900);
                } else {
                    this.showBubble(idx, 'STAND');
                    seat.stand = true;
                    this.botTurnTimeout = setTimeout(() => this.advanceLocalTurn(), 900);
                }
            };
            this.botTurnTimeout = setTimeout(decide, 700);
        }

        advanceLocalTurn() {
            const cap = this.session.capacity;
            let next = this.session.activeSeatIndex + 1;
            while (next < cap && (!this.session.seats[next] || !this.session.seats[next].active)) next++;
            if (next >= cap) {
                // Move to dealer
                this.currentPhase = 'DEALER';
                this.session.status = 'dealer';
                this.runLocalDealerSequence();
            } else {
                this.session.activeSeatIndex = next;
                this.processLocalTurn();
            }
        }

        runLocalDealerSequence() {
            this.renderDealer(this.session.dealer, false);
            document.getElementById('controls-playing').classList.add('hidden');
            document.getElementById('controls-waiting').classList.remove('hidden');
            document.getElementById('waiting-text').textContent = 'Dealer zieht Karten...';

            const draw = () => {
                this.session.dealer.score = calcHandScore(this.session.dealer.cards.map(c => Card.fromPlain(c)));
                this.renderDealer(this.session.dealer, false);

                const allBust = this.allActivePlayersBust(this.session);
                if (this.session.dealer.score >= 17 || allBust) {
                    setTimeout(() => this.evaluateLocalOutcomes(), 900);
                    return;
                }
                sound.cardSwoosh();
                const c = this.deck.draw();
                this.session.dealer.cards.push(c.toPlain());
                document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
                setTimeout(draw, 900);
            };
            setTimeout(draw, 900);
        }

        allActivePlayersBust(data) {
            let any = false, allBust = true;
            for (let i = 0; i < data.capacity; i++) {
                const s = data.seats[i];
                if (!s || !s.active) continue;
                any = true;
                if (!s.bust) allBust = false;
            }
            return any && allBust;
        }

        // ============================================================
        // CLOUD: HOST orchestration for bot turns and dealer
        // ============================================================
        maybeRunHostBotsTurn() {
            if (!this.isHost || !this.sessionDocRef) return;
            if (this._processingTurn) return;
            this.sessionDocRef.get().then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                if (data.status !== 'playing') return;

                const idx = data.activeSeatIndex;
                const seat = data.seats[idx];
                if (!seat || !seat.active) {
                    this._processingTurn = true;
                    this.hostAdvanceCloudTurn(data);
                    return;
                }
                if (seat.stand || seat.bust) {
                    this._processingTurn = true;
                    this.hostAdvanceCloudTurn(data);
                    return;
                }
                if (seat.isBot) {
                    this._processingTurn = true;
                    this.hostRunBotCloudTurn(idx, data);
                } else if (seat.pendingAction) {
                    this._processingTurn = true;
                    this.hostProcessPlayerAction(idx, seat.pendingAction, data);
                }
                // else: wait for that real player to act
            });
        }

        hostRunBotCloudTurn(idx, data) {
            const seat = data.seats[idx];
            const dealerUp = data.dealer.cards[0];
            const dealerVal = dealerUp ? (dealerUp.value === 11 ? 11 : dealerUp.value) : 10;

            const decide = () => {
                seat.score = calcHandScore((seat.cards || []).map(c => Card.fromPlain(c)));

                if (seat.score > 21) { seat.bust = true; seat.stand = true; this.commitCloudSeatAndAdvance(idx, data, 'BUST!'); return; }
                if (seat.score === 21) { seat.stand = true; this.commitCloudSeatAndAdvance(idx, data, '21!'); return; }

                let action = 'STAND';
                if (seat.score <= 11) {
                    action = 'HIT';
                    if ((seat.score === 10 || seat.score === 11) && dealerVal <= 9 && seat.cards.length === 2 && seat.coins >= seat.bet) action = 'DOUBLE';
                } else if (seat.score === 12) {
                    action = (dealerVal >= 4 && dealerVal <= 6) ? 'STAND' : 'HIT';
                } else if (seat.score >= 13 && seat.score <= 16) {
                    action = (dealerVal <= 6) ? 'STAND' : 'HIT';
                }

                if (action === 'HIT') {
                    const c = this.deck.draw();
                    seat.cards.push(c.toPlain());
                    setTimeout(() => {
                        // Recurse
                        this.sessionDocRef.update({
                            [`seats.${idx}.cards`]: seat.cards,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }).then(decide);
                    }, 900);
                } else if (action === 'DOUBLE') {
                    seat.coins -= seat.bet; seat.bet *= 2;
                    const c = this.deck.draw();
                    seat.cards.push(c.toPlain());
                    seat.stand = true;
                    seat.score = calcHandScore(seat.cards.map(cc => Card.fromPlain(cc)));
                    if (seat.score > 21) seat.bust = true;
                    setTimeout(() => this.commitCloudSeatAndAdvance(idx, data, 'DOUBLE'), 900);
                } else {
                    seat.stand = true;
                    setTimeout(() => this.commitCloudSeatAndAdvance(idx, data, 'STAND'), 900);
                }
            };
            setTimeout(decide, 800);
        }

        commitCloudSeatAndAdvance(idx, data, label) {
            let next = idx + 1;
            while (next < data.capacity && (!data.seats[next] || !data.seats[next].active)) next++;

            const updates = {
                [`seats.${idx}`]: data.seats[idx],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (next < data.capacity) {
                updates.activeSeatIndex = next;
                this.sessionDocRef.update(updates).then(() => {
                    this._processingTurn = false;
                    this.maybeRunHostBotsTurn();
                });
            } else {
                updates.status = 'dealer';
                this.sessionDocRef.update(updates).then(() => {
                    this._processingTurn = false;
                    this.runHostDealerSequence();
                });
            }
        }

        hostAdvanceCloudTurn(data) {
            let next = (data.activeSeatIndex || 0) + 1;
            while (next < data.capacity && (!data.seats[next] || !data.seats[next].active)) next++;
            if (next < data.capacity) {
                this.sessionDocRef.update({
                    activeSeatIndex: next,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    this._processingTurn = false;
                    this.maybeRunHostBotsTurn();
                });
            } else {
                this.sessionDocRef.update({
                    status: 'dealer',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    this._processingTurn = false;
                    this.runHostDealerSequence();
                });
            }
        }

        runHostDealerSequence() {
            if (!this.isHost || !this.sessionDocRef) return;
            this.sessionDocRef.get().then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                const dealer = data.dealer || { cards: [], score: 0 };

                const draw = () => {
                    dealer.score = calcHandScore((dealer.cards || []).map(c => Card.fromPlain(c)));
                    const allBust = this.allActivePlayersBust(data);
                    if (dealer.score >= 17 || allBust) {
                        // Compute outcomes
                        const outcomes = this.computeOutcomes(data, dealer);
                        // Apply payouts to seats
                        for (let i = 0; i < data.capacity; i++) {
                            const s = data.seats[i];
                            if (!s || !s.active) continue;
                            const o = outcomes[i];
                            if (o && o.payout) s.coins += o.payout;
                        }
                        this.sessionDocRef.update({
                            dealer,
                            seats: data.seats,
                            outcomes,
                            status: 'outcome',
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        return;
                    }
                    const c = this.deck.draw();
                    dealer.cards.push(c.toPlain());
                    setTimeout(() => {
                        this.sessionDocRef.update({
                            'dealer.cards': dealer.cards,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }).then(draw);
                    }, 900);
                };
                setTimeout(draw, 800);
            });
        }

        // ============================================================
        // USER ACTIONS
        // ============================================================
        executeUserAction(action) {
            sound.init();
            if (this.currentPhase !== 'PLAYING') return;

            if (this.session._local) {
                this.executeLocalUserAction(action);
            } else {
                this.executeCloudUserAction(action);
            }
        }

        executeLocalUserAction(action) {
            const idx = this.getMySeatIndex();
            const seat = this.session.seats[idx];
            if (!seat || this.session.activeSeatIndex !== idx) return;

            const finishTurn = () => {
                this.updateSeatUI(idx, seat, false);
                document.getElementById('controls-playing').classList.add('hidden');
                setTimeout(() => this.advanceLocalTurn(), 700);
            };

            if (action === 'HIT') {
                sound.click();
                const c = this.deck.draw();
                seat.cards.push(c.toPlain());
                sound.cardSwoosh();
                seat.score = calcHandScore(seat.cards.map(cc => Card.fromPlain(cc)));
                this.updateSeatUI(idx, seat, true);
                document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;

                if (seat.score > 21) {
                    seat.bust = true;
                    this.showBubble(idx, 'BUST!', 'bust');
                    sound.lose();
                    finishTurn();
                } else if (seat.score === 21) {
                    seat.stand = true;
                    this.showBubble(idx, '21!', 'bj');
                    finishTurn();
                } else {
                    // Continue user's turn
                    const btnDouble = document.getElementById('btn-action-double');
                    btnDouble.disabled = true;
                    btnDouble.classList.add('disabled');
                }
            } else if (action === 'STAND') {
                sound.click();
                seat.stand = true;
                this.showBubble(idx, 'STAND');
                finishTurn();
            } else if (action === 'DOUBLE') {
                if (seat.cards.length !== 2 || this.player.coins < seat.bet) return;
                sound.click();
                this.player.coins -= seat.bet;
                seat.coins = this.player.coins;
                seat.bet *= 2;
                this.updateHUD();
                sound.chipDrop();
                this.updateSeatUI(idx, seat, true);
                document.getElementById('controls-playing').classList.add('hidden');

                setTimeout(() => {
                    const c = this.deck.draw();
                    seat.cards.push(c.toPlain());
                    sound.cardSwoosh();
                    seat.score = calcHandScore(seat.cards.map(cc => Card.fromPlain(cc)));
                    if (seat.score > 21) seat.bust = true;
                    seat.stand = true;
                    this.updateSeatUI(idx, seat, true);
                    document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
                    if (seat.bust) this.showBubble(idx, 'BUST!', 'bust'); else this.showBubble(idx, 'DOUBLE!');
                    finishTurn();
                }, 800);
            }
        }

        executeCloudUserAction(action) {
            // Only the host draws cards authoritatively. Non-host clients (and host's own user)
            // signal a "pendingAction" on their seat. Host's listener picks it up and processes it,
            // so every client sees the same cards.
            const myIdx = this.getMySeatIndex();
            if (myIdx === -1) return;
            // Optimistically hide controls
            document.getElementById('controls-playing').classList.add('hidden');
            document.getElementById('controls-waiting').classList.remove('hidden');
            document.getElementById('waiting-text').textContent = 'Aktion wird verarbeitet...';

            this.sessionDocRef.update({
                [`seats.${myIdx}.pendingAction`]: action,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => {
                console.warn('Cloud action submit failed:', err);
                Toast.error('Verbindungsfehler. Bitte erneut versuchen.', 2500);
            });
        }

        hostProcessPlayerAction(idx, action, data) {
            const seat = data.seats[idx];
            if (!seat || !seat.active) { this._processingTurn = false; return; }

            if (action === 'HIT') {
                const c = this.deck.draw();
                seat.cards.push(c.toPlain());
                seat.score = calcHandScore(seat.cards.map(cc => Card.fromPlain(cc)));
                if (seat.score > 21) { seat.bust = true; seat.stand = true; }
                else if (seat.score === 21) { seat.stand = true; }
            } else if (action === 'STAND') {
                seat.stand = true;
            } else if (action === 'DOUBLE') {
                if (seat.cards.length !== 2) { /* invalid - just clear */ }
                else {
                    seat.coins = Math.max(0, (seat.coins || 0) - seat.bet);
                    seat.bet *= 2;
                    const c = this.deck.draw();
                    seat.cards.push(c.toPlain());
                    seat.score = calcHandScore(seat.cards.map(cc => Card.fromPlain(cc)));
                    if (seat.score > 21) seat.bust = true;
                    seat.stand = true;
                }
            }
            seat.pendingAction = null;

            const updates = {
                [`seats.${idx}`]: seat,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (seat.stand || seat.bust) {
                let next = idx + 1;
                while (next < data.capacity && (!data.seats[next] || !data.seats[next].active)) next++;
                if (next >= data.capacity) {
                    updates.status = 'dealer';
                    this.sessionDocRef.update(updates).then(() => {
                        this._processingTurn = false;
                        this.runHostDealerSequence();
                    });
                } else {
                    updates.activeSeatIndex = next;
                    this.sessionDocRef.update(updates).then(() => {
                        this._processingTurn = false;
                        this.maybeRunHostBotsTurn();
                    });
                }
            } else {
                this.sessionDocRef.update(updates).then(() => { this._processingTurn = false; });
            }
        }

        showBubble(seatIdx, msg, variant) {
            const seatEl = this.seatsContainer.querySelector(`.seat[data-seat-idx="${seatIdx}"]`);
            if (!seatEl) return;
            const bubble = seatEl.querySelector('[data-role="bubble"]');
            if (!bubble) return;
            bubble.textContent = msg;
            bubble.className = 'action-bubble visible' + (variant ? ' ' + variant : '');
            setTimeout(() => bubble.classList.remove('visible', 'bust', 'bj'), 1800);
        }

        // ============================================================
        // OUTCOMES & PAYOUTS
        // ============================================================
        computeOutcomes(data, dealer) {
            const dealerScore = dealer.score;
            const dealerBust = dealerScore > 21;
            const dealerBJ = dealerScore === 21 && (dealer.cards || []).length === 2;
            const outcomes = {};
            for (let i = 0; i < data.capacity; i++) {
                const s = data.seats[i];
                if (!s || !s.active) continue;
                const score = s.score || 0;
                const bust = !!s.bust;
                const bj = score === 21 && (s.cards || []).length === 2;
                let result = 'LOSE'; let payout = 0; let xp = 5;

                if (bust) {
                    result = 'BUST'; payout = 0; xp = 5;
                } else if (dealerBust) {
                    result = bj ? 'BLACKJACK' : 'WIN';
                    payout = bj ? Math.floor(s.bet * 2.5) : s.bet * 2;
                    xp = bj ? 25 : 15;
                } else if (score > dealerScore) {
                    result = bj ? 'BLACKJACK' : 'WIN';
                    payout = bj ? Math.floor(s.bet * 2.5) : s.bet * 2;
                    xp = bj ? 25 : 15;
                } else if (score < dealerScore) {
                    result = 'LOSE'; payout = 0; xp = 5;
                } else {
                    if (bj && !dealerBJ) {
                        result = 'BLACKJACK';
                        payout = Math.floor(s.bet * 2.5);
                        xp = 25;
                    } else if (!bj && dealerBJ) {
                        result = 'LOSE'; payout = 0; xp = 5;
                    } else {
                        result = 'PUSH'; payout = s.bet; xp = 10;
                    }
                }
                outcomes[i] = { result, payout, xp };
            }
            return outcomes;
        }

        evaluateLocalOutcomes() {
            const dealer = this.session.dealer;
            const outcomes = this.computeOutcomes(this.session, dealer);
            this.session.outcomes = outcomes;

            // Apply payouts to local seats and update player coins for the user.
            for (let i = 0; i < this.session.capacity; i++) {
                const s = this.session.seats[i];
                if (!s || !s.active) continue;
                const o = outcomes[i];
                if (!o) continue;
                if (o.payout) s.coins += o.payout;
                if (s.userId === this.userId) {
                    this.player.coins = s.coins;
                }
            }
            this.session.status = 'outcome';
            this.currentPhase = 'OUTCOME';
            this.showOutcomeBanner(this.session);
        }

        showOutcomeBanner(data) {
            if (this.outcomeShown) return;
            this.outcomeShown = true;
            const banner = document.getElementById('game-outcome-banner');
            banner.classList.remove('hidden', 'outcome-win', 'outcome-lose', 'outcome-push', 'outcome-blackjack');

            const myIdx = this.getMySeatIndex();
            const outcome = data.outcomes && data.outcomes[myIdx];

            // Stats only for the user
            if (outcome) {
                this.player.stats.handsPlayed++;
                if (outcome.result === 'WIN' || outcome.result === 'BLACKJACK') this.player.stats.handsWon++;
                if (outcome.result === 'BLACKJACK') this.player.stats.blackjacks++;
                if (outcome.payout) {
                    this.player.coins = (data.seats[myIdx] && data.seats[myIdx].coins) || (this.player.coins + outcome.payout);
                }
            }

            let title, css;
            if (!outcome) { title = 'RUNDE BEENDET'; css = 'outcome-push'; }
            else if (outcome.result === 'BLACKJACK') { title = 'BLACKJACK!'; css = 'outcome-blackjack'; sound.blackjack(); this.launchConfetti(); }
            else if (outcome.result === 'WIN') { title = 'GEWONNEN!'; css = 'outcome-win'; sound.win(); this.launchConfetti(); }
            else if (outcome.result === 'PUSH') { title = 'UNENTSCHIEDEN'; css = 'outcome-push'; sound.push(); }
            else if (outcome.result === 'BUST') { title = 'BUST'; css = 'outcome-lose'; sound.lose(); }
            else { title = 'VERLOREN'; css = 'outcome-lose'; sound.lose(); }
            banner.classList.add(css);

            document.getElementById('outcome-title').textContent = title;
            const chipsEl = document.getElementById('outcome-chips-won');
            const xpEl = document.getElementById('outcome-xp-won');
            chipsEl.innerHTML = outcome && outcome.payout
                ? `+ ${outcome.payout.toLocaleString('de-DE')} <svg class="inline-coin" viewBox="0 0 100 100"><use href="#ico-coin"/></svg>`
                : `0 <svg class="inline-coin" viewBox="0 0 100 100"><use href="#ico-coin"/></svg>`;
            xpEl.textContent = outcome ? `+ ${outcome.xp} XP` : '';

            this.syncTableUI();

            if (outcome) this.addXP(outcome.xp);
            this.updateHUD();

            // Tell everyone to return to lobby after a short countdown.
            const lobbyAfter = 5;
            document.getElementById('lobby-countdown').textContent = lobbyAfter;
            let remaining = lobbyAfter;
            const tick = setInterval(() => {
                remaining--;
                if (remaining <= 0) { clearInterval(tick); }
                document.getElementById('lobby-countdown').textContent = Math.max(0, remaining);
            }, 1000);

            this.lobbyReturnTimeout = setTimeout(() => this.endRoundReturnToLobby(), lobbyAfter * 1000);
        }

        launchConfetti() {
            const stage = document.getElementById('confetti-stage');
            if (!stage) return;
            const colors = ['#facc15', '#22c55e', '#15803d', '#fde047', '#16a34a', '#fbbf24'];
            for (let i = 0; i < 60; i++) {
                const c = document.createElement('div');
                c.className = 'confetti-piece';
                c.style.left = (Math.random() * 100) + '%';
                c.style.background = colors[Math.floor(Math.random() * colors.length)];
                c.style.animationDelay = (Math.random() * 0.6) + 's';
                c.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
                c.style.transform = `rotate(${Math.random() * 360}deg)`;
                stage.appendChild(c);
                setTimeout(() => c.remove(), 3200);
            }
        }

        endRoundReturnToLobby() {
            // Close session if we're host; everyone listens and returns.
            if (this.session && this.session._local) {
                this.returnToLobby();
                return;
            }
            if (this.sessionDocRef && this.isHost) {
                this.sessionDocRef.update({
                    status: 'closed',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});
                // Delete after a bit so others have time to read final state
                setTimeout(() => {
                    this.sessionDocRef.delete().catch(() => {});
                }, 2000);
            }
            this.returnToLobby();
        }

        returnToLobby() {
            // Clear pending timers
            if (this.lobbyReturnTimeout) { clearTimeout(this.lobbyReturnTimeout); this.lobbyReturnTimeout = null; }
            if (this.botFillTimeout) { clearTimeout(this.botFillTimeout); this.botFillTimeout = null; }
            if (this.botTurnTimeout) { clearTimeout(this.botTurnTimeout); this.botTurnTimeout = null; }
            if (this.sessionListener) { this.sessionListener(); this.sessionListener = null; }

            this.session = null;
            this.sessionDocRef = null;
            this.isHost = false;
            this.currentPhase = 'LOBBY';
            this.outcomeShown = false;

            document.getElementById('game-outcome-banner').classList.add('hidden');
            document.getElementById('confetti-stage').innerHTML = '';
            this.showScreen(this.screenLobby);
            this.renderLobby();
        }

        // ============================================================
        // LEAVE TABLE
        // ============================================================
        handleLeaveTablePressed() {
            sound.click();
            const mySeat = this.getMySeat();
            const hasBet = mySeat && mySeat.bet > 0 && ['BETTING', 'PLAYING', 'DEALER'].includes(this.currentPhase);
            const phaseLost = ['PLAYING', 'DEALER'].includes(this.currentPhase);

            const doLeave = () => this.performLeaveTable(phaseLost);

            if (hasBet) {
                inAppConfirm({
                    title: 'Tisch verlassen?',
                    message: phaseLost
                        ? 'Du verlierst deinen Einsatz, wenn du jetzt verlässt. Möchtest du fortfahren?'
                        : 'Möchtest du den Tisch wirklich verlassen? Dein Einsatz wird zurückerstattet.',
                    okText: 'Verlassen',
                    cancelText: 'Bleiben',
                    danger: true
                }).then(ok => { if (ok) doLeave(); });
            } else {
                doLeave();
            }
        }

        performLeaveTable(loseBet) {
            const mySeat = this.getMySeat();
            if (mySeat && !loseBet && mySeat.bet > 0 && this.currentPhase === 'BETTING') {
                // refund the bet by leaving bet field intact (we haven't deducted player.coins yet in cloud).
                // In local mode we haven't deducted yet during betting phase either.
            }
            if (this.session && this.session._local) {
                this.returnToLobby();
                return;
            }
            this.bestEffortDisconnect();
            this.returnToLobby();
        }
    }

    // ====================================================================
    // UTILS
    // ====================================================================
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Boot
    window.addEventListener('DOMContentLoaded', () => {
        const game = new GameManager();
        window.__GR_GAME = game; // for debugging
        game.init();
    });

})();
