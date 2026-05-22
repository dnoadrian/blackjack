/**
 * Grand Royale Casino - Blackjack Engine
 * Client-Side Application with Firebase Live-Multiplayer
 */

// --- FIREBASE CONFIGURATION ---
// Set to your Firebase project config to enable real online multiplayer and global leaderboard!
// See Firebase_Setup_Guide.md for setup instructions.
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
let isFirebaseEnabled = false;

// Initialize Firebase if config is supplied
if (firebaseConfig && typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        isFirebaseEnabled = true;
        console.log("🔥 Firebase online multiplayer enabled!");
    } catch (e) {
        console.error("❌ Failed to initialize Firebase:", e);
    }
}

// --- VECTOR ASSETS: SVG SUITS & FACES ---
const SUITS = {
    SPADES: {
        name: 'spades',
        char: '♠',
        color: 'black',
        svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M50,15 C38,40 10,42 10,65 C10,80 30,85 50,70 C70,85 90,80 90,65 C90,42 62,40 50,15 Z" fill="#111827"/>
            <path d="M50,65 L50,90 L38,90 L62,90 Z" fill="#111827"/>
        </svg>`
    },
    HEARTS: {
        name: 'hearts',
        char: '♥',
        color: 'red',
        svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M50,30 C50,10 10,10 10,48 C10,75 50,92 50,92 C50,92 90,75 90,48 C90,10 50,10 50,30 Z" fill="#EF4444"/>
        </svg>`
    },
    DIAMONDS: {
        name: 'diamonds',
        char: '♦',
        color: 'red',
        svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M50,10 L88,50 L50,90 L12,50 Z" fill="#EF4444"/>
        </svg>`
    },
    CLUBS: {
        name: 'clubs',
        char: '♣',
        color: 'black',
        svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="33" r="18" fill="#111827"/>
            <circle cx="32" cy="58" r="18" fill="#111827"/>
            <circle cx="68" cy="58" r="18" fill="#111827"/>
            <path d="M50,55 L50,90 L38,90 L62,90 Z" fill="#111827"/>
            <circle cx="50" cy="56" r="6" fill="#111827"/>
        </svg>`
    }
};

const ROYALTY_ART = {
    'J': `<svg viewBox="0 0 60 80" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.15">
        <rect x="15" y="10" width="30" height="60" rx="3" fill="none" stroke="#111" stroke-width="2"/>
        <circle cx="30" cy="25" r="10" fill="none" stroke="#111" stroke-width="2"/>
        <path d="M22,35 L38,35 L38,60 L22,60 Z" fill="none" stroke="#111" stroke-width="2"/>
        <path d="M20,13 L40,13" stroke="#111" stroke-width="3"/>
    </svg>`,
    'Q': `<svg viewBox="0 0 60 80" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.15">
        <rect x="15" y="10" width="30" height="60" rx="3" fill="none" stroke="#111" stroke-width="2"/>
        <circle cx="30" cy="30" r="12" fill="none" stroke="#111" stroke-width="2"/>
        <path d="M22,12 L30,6 L38,12 Z" fill="#111"/>
    </svg>`,
    'K': `<svg viewBox="0 0 60 80" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.15">
        <rect x="15" y="10" width="30" height="60" rx="3" fill="none" stroke="#111" stroke-width="2"/>
        <circle cx="30" cy="28" r="14" fill="none" stroke="#111" stroke-width="2"/>
        <path d="M18,10 L30,4 L42,10 L36,18 L24,18 Z" fill="#111"/>
    </svg>`,
    'A': `<svg viewBox="0 0 60 80" width="100%" height="100%" style="opacity: 0.15" fill="currentColor">
        <text x="30" y="55" font-size="45" font-family="'Montserrat', sans-serif" font-weight="bold" text-anchor="middle">★</text>
    </svg>`
};

// --- WEBAUDIO SYNTHESIZER SOUND ENGINE ---
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playClick() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.09);
    }

    playChipDrop() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const playTone = (pitch, delay, volume) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(pitch, now + delay);
            osc.frequency.exponentialRampToValueAtTime(pitch * 2.5, now + delay + 0.04);
            
            gain.gain.setValueAtTime(volume, now + delay);
            gain.gain.linearRampToValueAtTime(0.001, now + delay + 0.05);
            
            osc.start(now + delay);
            osc.stop(now + delay + 0.06);
        };
        playTone(320, 0, 0.15);
        playTone(380, 0.02, 0.1);
    }

    playCardSwoosh() {
        if (this.muted) return;
        this.init();
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
        filter.Q.setValueAtTime(5, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.16);
    }

    playWin() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
            
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.4);
        });
    }

    playLose() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.45);

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }

    playPush() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const playTone = (pitch) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, now);
            
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            
            osc.start();
            osc.stop(now + 0.35);
        };
        playTone(330);
        playTone(360);
    }

    playBlackjack() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const chords = [392.00, 493.88, 587.33, 783.99, 987.77];
        chords.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.06);
            
            gain.gain.setValueAtTime(0.1, now + i * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.5);
            
            osc.start(now + i * 0.06);
            osc.stop(now + i * 0.06 + 0.6);
        });
    }

    playShuffle() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        for (let i = 0; i < 6; i++) {
            const time = now + i * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150 + Math.random() * 100, time);
            
            gain.gain.setValueAtTime(0.08, time);
            gain.gain.linearRampToValueAtTime(0.001, time + 0.06);
            
            osc.start(time);
            osc.stop(time + 0.07);
        }
    }
}

const sound = new SoundEngine();

// --- DECK & CARD MODEL ---
class Card {
    constructor(suit, rank, value) {
        this.suit = suit; // Spades, Hearts, Diamonds, Clubs object
        this.rank = rank; // '2'-'10', 'J', 'Q', 'K', 'A'
        this.value = value; // numeric value
    }

    render(isFaceDown = false) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `playing-card ${this.suit.color}`;
        
        if (isFaceDown) {
            cardDiv.classList.add('card-back');
            return cardDiv;
        }

        const topLeft = document.createElement('div');
        topLeft.className = 'card-corner top';
        topLeft.innerHTML = `<span class="card-rank">${this.rank}</span><span class="card-suit-icon">${this.suit.char}</span>`;
        cardDiv.appendChild(topLeft);

        const center = document.createElement('div');
        center.className = 'card-center';
        if (ROYALTY_ART[this.rank]) {
            center.innerHTML = ROYALTY_ART[this.rank];
        } else {
            center.innerHTML = this.suit.svg;
        }
        cardDiv.appendChild(center);

        const bottomRight = document.createElement('div');
        bottomRight.className = 'card-corner bottom';
        bottomRight.innerHTML = `<span class="card-rank">${this.rank}</span><span class="card-suit-icon">${this.suit.char}</span>`;
        cardDiv.appendChild(bottomRight);

        return cardDiv;
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
            for (const suitKey in SUITS) {
                const suit = SUITS[suitKey];
                for (const rInfo of ranks) {
                    this.cards.push(new Card(suit, rInfo.r, rInfo.v));
                }
            }
        }
    }

    shuffle() {
        sound.playShuffle();
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        if (this.cards.length === 0) {
            this.reset();
            this.shuffle();
        }
        return this.cards.pop();
    }

    get remaining() {
        return this.cards.length;
    }
}

// --- BOT POOL ---
const BOT_POOL = [
    { name: 'Viktor (Pro)', avatar: '🦊', rank: 'Gold II', minLvl: 4, coins: 2150 },
    { name: 'Sophia VIP', avatar: '👸', rank: 'Platin V', minLvl: 7, coins: 5900 },
    { name: 'Klaus', avatar: '👨‍💼', rank: 'Silber I', minLvl: 2, coins: 800 },
    { name: 'Elena', avatar: '👩‍💼', rank: 'Silber IV', minLvl: 3, coins: 1250 },
    { name: 'Dieter', avatar: '🎩', rank: 'Gold V', minLvl: 6, coins: 3400 },
    { name: 'Isabella', avatar: '👸', rank: 'Diamant III', minLvl: 12, coins: 14500 },
    { name: 'Maximilian', avatar: '🦁', rank: 'Legend', minLvl: 18, coins: 48000 },
    { name: 'Clara', avatar: '🦉', rank: 'Bronze I', minLvl: 1, coins: 240 },
    { name: 'Hans', avatar: '🤵', rank: 'Silber III', minLvl: 3, coins: 950 },
    { name: 'Mia', avatar: '👸', rank: 'Gold I', minLvl: 5, coins: 1850 }
];

// --- CORE GAME STATE MANAGER ---
class GameManager {
    constructor() {
        this.player = {
            name: 'Gast_' + Math.floor(100 + Math.random() * 900),
            avatar: '🤵',
            coins: 1000,
            xp: 0,
            level: 1,
            stats: {
                handsPlayed: 0,
                handsWon: 0,
                blackjacks: 0,
                highestChips: 1000
            },
            lastDailySpin: 0
        };

        // Game Shoe Variables
        this.deck = new Deck(6);
        this.deck.shuffle();
        
        this.activeTable = null; // 'casual', 'standard', 'vip'
        this.currentBet = 0;
        this.currentPhase = 'LOBBY';
        
        // Seats representation
        this.seats = {
            left: { active: false, name: '', avatar: '', coins: 0, rank: '', hand: [], score: 0, bet: 0, stand: false, bust: false, isReal: false },
            user: { active: true, hand: [], score: 0, bet: 0, stand: false, bust: false },
            right: { active: false, name: '', avatar: '', coins: 0, rank: '', hand: [], score: 0, bet: 0, stand: false, bust: false, isReal: false },
            dealer: { hand: [], score: 0 }
        };

        this.dealerDownCard = null;
        this.sessionDocRef = null;
        this.sessionListener = null;
        this.isHost = false;
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);

        // Daily Bonus Segment Configuration
        this.wheelPrizes = [
            { val: 100, label: '100', color: '#1f2937' },
            { val: 250, label: '250', color: '#f59e0b' },
            { val: 50, label: '50', color: '#111827' },
            { val: 500, label: '500', color: '#8b5cf6' },
            { val: 150, label: '150', color: '#1f2937' },
            { val: 1000, label: '1K 🌟', color: '#EF4444' },
            { val: 200, label: '200', color: '#1f2937' },
            { val: 0, label: 'Niete', color: '#374151' }
        ];

        this.botBetRange = {
            casual: [10, 50],
            standard: [100, 300],
            vip: [500, 2000]
        };
    }

    init() {
        this.loadProfile();
        this.setupDOM();
        this.renderLobby();
        this.startBackgroundSimulations();
    }

    loadProfile() {
        const saved = localStorage.getItem('grand_royale_profile');
        if (saved) {
            try {
                this.player = JSON.parse(saved);
                if (!this.player.stats) this.player.stats = { handsPlayed: 0, handsWon: 0, blackjacks: 0, highestChips: 1000 };
                if (!this.player.lastDailySpin) this.player.lastDailySpin = 0;
            } catch (e) {
                console.error("Fehler beim Laden des Profils", e);
            }
        }
        this.recalculateRank();
    }

    saveProfile() {
        this.player.stats.highestChips = Math.max(this.player.stats.highestChips, this.player.coins);
        localStorage.setItem('grand_royale_profile', JSON.stringify(this.player));
        this.updateHUD();
        
        // Sync to cloud database if online mode is configured
        if (isFirebaseEnabled) {
            db.collection('leaderboard').doc(this.player.name).set({
                name: this.player.name,
                avatar: this.player.avatar,
                coins: this.player.coins,
                rank: this.player.rankName,
                level: this.player.level,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(e => console.error("Firebase write error:", e));
        }
    }

    recalculateRank() {
        this.player.level = Math.floor(Math.sqrt(this.player.xp / 100)) + 1;
        const rankNames = ['Bronze', 'Silber', 'Gold', 'Platin', 'Diamant'];
        const lvl = this.player.level;

        if (lvl >= 25) {
            this.player.rankName = 'Casino Legende';
        } else {
            const rankIndex = Math.floor((lvl - 1) / 5);
            const subTier = 5 - ((lvl - 1) % 5);
            const roman = ['I', 'II', 'III', 'IV', 'V'][subTier - 1];
            this.player.rankName = `${rankNames[rankIndex]} ${roman}`;
        }
    }

    addXP(amount) {
        const oldLevel = this.player.level;
        this.player.xp += amount;
        this.recalculateRank();
        if (this.player.level > oldLevel) {
            const bonus = this.player.level * 100;
            this.player.coins += bonus;
            alert(`🎉 LEVEL UP! Du bist jetzt Level ${this.player.level}! Aufstiegsbonus: ${bonus} 🪙`);
        }
        this.saveProfile();
    }

    // --- DOM INITIALIZATION ---
    setupDOM() {
        this.screenLobby = document.getElementById('screen-lobby');
        this.screenMatchmaking = document.getElementById('screen-matchmaking');
        this.screenTable = document.getElementById('screen-game-table');
        this.modalProfile = document.getElementById('modal-profile');
        this.modalRules = document.getElementById('modal-rules');
        this.inputNickname = document.getElementById('input-nickname');
        
        // --- DYNAMIC SVG SPINNING WHEEL BUILDER ---
        const spinner = document.getElementById('wheel-spinner');
        spinner.innerHTML = '';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const degStep = 360 / this.wheelPrizes.length;
        
        this.wheelPrizes.forEach((prize, idx) => {
            // Draw slice arc path
            const angleStart = idx * degStep - 90 - (degStep / 2);
            const angleEnd = (idx + 1) * degStep - 90 - (degStep / 2);
            const radStart = angleStart * Math.PI / 180;
            const radEnd = angleEnd * Math.PI / 180;
            
            const x1 = 50 + 50 * Math.cos(radStart);
            const y1 = 50 + 50 * Math.sin(radStart);
            const x2 = 50 + 50 * Math.cos(radEnd);
            const y2 = 50 + 50 * Math.sin(radEnd);
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M 50 50 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 50 50 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`);
            path.setAttribute('fill', prize.color);
            path.setAttribute('stroke', '#1f2937');
            path.setAttribute('stroke-width', '0.5');
            svg.appendChild(path);
            
            // Draw text radially
            const angleText = idx * degStep - 90;
            const radText = angleText * Math.PI / 180;
            const tx = 50 + 32 * Math.cos(radText);
            const ty = 50 + 32 * Math.sin(radText);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', tx.toFixed(2));
            text.setAttribute('y', (ty + 1.8).toFixed(2));
            text.setAttribute('fill', '#ffffff');
            text.setAttribute('font-size', '4.5');
            text.setAttribute('font-family', 'Montserrat, sans-serif');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('transform', `rotate(${angleText}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`);
            text.textContent = prize.label;
            
            svg.appendChild(text);
        });

        // Center hub circle
        const hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hub.setAttribute('cx', '50');
        hub.setAttribute('cy', '50');
        hub.setAttribute('r', '8');
        hub.setAttribute('fill', '#f59e0b');
        hub.setAttribute('stroke', '#ffffff');
        hub.setAttribute('stroke-width', '1.5');
        svg.appendChild(hub);
        
        spinner.appendChild(svg);

        this.registerEvents();
    }

    registerEvents() {
        document.getElementById('btn-show-rules').addEventListener('click', () => {
            sound.playClick();
            this.modalRules.classList.add('active');
        });
        document.getElementById('close-rules-modal').addEventListener('click', () => {
            sound.playClick();
            this.modalRules.classList.remove('active');
        });

        document.getElementById('btn-show-profile').addEventListener('click', () => {
            sound.playClick();
            this.inputNickname.value = this.player.name;
            const avatars = this.modalProfile.querySelectorAll('.avatar-select-btn');
            avatars.forEach(btn => {
                if (btn.getAttribute('data-avatar') === this.player.avatar) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            this.modalProfile.classList.add('active');
        });

        document.getElementById('close-profile-modal').addEventListener('click', () => {
            sound.playClick();
            this.modalProfile.classList.remove('active');
        });

        document.getElementById('btn-save-profile').addEventListener('click', () => {
            sound.playClick();
            const newName = this.inputNickname.value.trim();
            if (newName.length > 0) {
                this.player.name = newName;
            }
            const activeAvatarBtn = this.modalProfile.querySelector('.avatar-select-btn.active');
            if (activeAvatarBtn) {
                this.player.avatar = activeAvatarBtn.getAttribute('data-avatar');
            }
            this.saveProfile();
            this.modalProfile.classList.remove('active');
        });

        this.modalProfile.querySelectorAll('.avatar-select-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sound.playClick();
                this.modalProfile.querySelectorAll('.avatar-select-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const btnSound = document.getElementById('btn-sound-toggle');
        btnSound.addEventListener('click', () => {
            sound.muted = !sound.muted;
            btnSound.innerHTML = sound.muted ? '🔇' : '🔊';
            if (!sound.muted) {
                sound.playClick();
            }
        });

        document.getElementById('btn-spin-wheel').addEventListener('click', () => this.spinDailyWheel());

        document.querySelectorAll('.btn-join-table').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tableId = e.currentTarget.getAttribute('data-table-id');
                this.startMatchmaking(tableId);
            });
        });

        document.getElementById('btn-cancel-matchmaking').addEventListener('click', () => {
            sound.playClick();
            this.leaveMatchmaking();
        });

        document.getElementById('btn-leave-table').addEventListener('click', () => {
            sound.playClick();
            this.leaveGameTable();
        });

        document.querySelectorAll('.casino-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                sound.playClick();
                const val = parseInt(e.currentTarget.getAttribute('data-val'), 10);
                this.addUserBet(val);
            });
        });

        document.getElementById('btn-clear-bet').addEventListener('click', () => {
            sound.playClick();
            this.clearUserBet();
        });

        document.getElementById('btn-deal-cards').addEventListener('click', () => {
            if (this.seats.user.bet > 0) {
                this.startGameRound();
            }
        });

        document.getElementById('user-bet-circle').addEventListener('click', () => {
            this.addUserBet(10);
        });

        document.getElementById('btn-action-hit').addEventListener('click', () => this.executeUserAction('HIT'));
        document.getElementById('btn-action-stand').addEventListener('click', () => this.executeUserAction('STAND'));
        document.getElementById('btn-action-double').addEventListener('click', () => this.executeUserAction('DOUBLE'));
    }

    showScreen(screen) {
        this.screenLobby.classList.remove('active');
        this.screenMatchmaking.classList.remove('active');
        this.screenTable.classList.remove('active');
        screen.classList.add('active');
    }

    updateHUD() {
        document.getElementById('hud-player-name').textContent = this.player.name;
        document.getElementById('hud-avatar').src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%231F2937'/><text x='50' y='60' font-size='35' text-anchor='middle' fill='%23F59E0B'>${this.player.avatar}</text></svg>`;
        document.getElementById('hud-rank-name').textContent = this.player.rankName;
        document.getElementById('hud-level-number').textContent = `Lvl ${this.player.level}`;
        document.getElementById('hud-coins-amount').textContent = this.player.coins.toLocaleString('de-DE');

        const currentLevelXPStart = Math.pow(this.player.level - 1, 2) * 100;
        const nextLevelXPEnd = Math.pow(this.player.level, 2) * 100;
        const levelRange = nextLevelXPEnd - currentLevelXPStart;
        const currentProgress = this.player.xp - currentLevelXPStart;
        const pct = Math.min(100, Math.max(0, (currentProgress / levelRange) * 100));
        
        document.getElementById('hud-xp-fill').style.width = `${pct}%`;
        document.getElementById('hud-xp-text').textContent = `${this.player.xp} / ${nextLevelXPEnd} XP`;
    }

    renderLobby() {
        this.updateHUD();
        
        document.getElementById('stat-hands-played').textContent = this.player.stats.handsPlayed;
        const winrate = this.player.stats.handsPlayed > 0 
            ? Math.round((this.player.stats.handsWon / this.player.stats.handsPlayed) * 100) 
            : 0;
        document.getElementById('stat-win-rate').textContent = `${winrate}%`;
        document.getElementById('stat-blackjack-count').textContent = this.player.stats.blackjacks;
        document.getElementById('stat-highest-chips').textContent = this.player.stats.highestChips.toLocaleString('de-DE');

        const now = Date.now();
        const spinCooldown = 24 * 60 * 60 * 1000;
        const diff = now - this.player.lastDailySpin;
        const spinBtn = document.getElementById('btn-spin-wheel');
        const spinTimer = document.getElementById('wheel-timer');

        if (diff < spinCooldown) {
            spinBtn.disabled = true;
            spinBtn.classList.add('disabled');
            spinTimer.classList.remove('hidden');
            this.startWheelTimerUpdate();
        } else {
            spinBtn.disabled = false;
            spinBtn.classList.remove('disabled');
            spinTimer.classList.add('hidden');
        }

        this.renderLeaderboard();
    }

    startWheelTimerUpdate() {
        if (this.wheelInterval) clearInterval(this.wheelInterval);
        const update = () => {
            const now = Date.now();
            const spinCooldown = 24 * 60 * 60 * 1000;
            const diff = now - this.player.lastDailySpin;
            const remaining = spinCooldown - diff;

            if (remaining <= 0) {
                clearInterval(this.wheelInterval);
                this.renderLobby();
            } else {
                const hrs = Math.floor(remaining / (1000 * 60 * 60));
                const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((remaining % (1000 * 60)) / 1000);
                document.getElementById('wheel-timer').textContent = `Nächster Spin in: ${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        };
        update();
        this.wheelInterval = setInterval(update, 1000);
    }

    // --- DAILY SPIN WHEEL ---
    spinDailyWheel() {
        sound.init();
        const spinBtn = document.getElementById('btn-spin-wheel');
        spinBtn.disabled = true;
        spinBtn.classList.add('disabled');

        const randIdx = Math.floor(Math.random() * this.wheelPrizes.length);
        const prize = this.wheelPrizes[randIdx];

        const degStep = 360 / this.wheelPrizes.length;
        // Spin multiple times then land on prize index
        const spinDegrees = (360 * 5) + (360 - (randIdx * degStep));

        const spinner = document.getElementById('wheel-spinner');
        spinner.style.transform = `rotate(${spinDegrees}deg)`;

        let tickCount = 0;
        const tickInterval = setInterval(() => {
            if (tickCount < 18) {
                sound.playClick();
                tickCount++;
            } else {
                clearInterval(tickInterval);
            }
        }, 180);

        setTimeout(() => {
            this.player.coins += prize.val;
            this.player.lastDailySpin = Date.now();
            this.saveProfile();
            
            if (prize.val > 0) {
                sound.playWin();
                alert(`🎁 Glückwunsch! Du hast ${prize.label} 🪙 erhalten!`);
            } else {
                sound.playLose();
                alert(`😢 Niete! Morgen hast du eine neue Chance!`);
            }
            
            spinner.style.transition = 'none';
            const finalAngle = 360 - (randIdx * degStep);
            spinner.style.transform = `rotate(${finalAngle}deg)`;
            setTimeout(() => {
                spinner.style.transition = 'transform 4s cubic-bezier(0.15, 0.85, 0.35, 1)';
            }, 50);

            this.renderLobby();
        }, 4100);
    }

    // --- LEADERBOARDS: CLOUD & LOCAL FALLBACKS ---
    renderLeaderboard() {
        if (isFirebaseEnabled) {
            db.collection('leaderboard').orderBy('coins', 'desc').limit(10).get()
                .then(snapshot => {
                    const board = document.getElementById('leaderboard-list');
                    board.innerHTML = '';
                    
                    const list = [];
                    snapshot.forEach(doc => {
                        list.push(doc.data());
                    });
                    
                    // Add user to local view if not in cloud top 10
                    const userInList = list.some(item => item.name === this.player.name);
                    if (!userInList) {
                        list.push({
                            name: `${this.player.name} (Du)`,
                            avatar: this.player.avatar,
                            coins: this.player.coins,
                            rank: this.player.rankName,
                            isUser: true
                        });
                        list.sort((a, b) => b.coins - a.coins);
                    }

                    list.forEach((p, idx) => {
                        const isUser = p.name === this.player.name || p.isUser;
                        const item = document.createElement('div');
                        item.className = `leaderboard-item ${isUser ? 'rank-user' : ''}`;
                        item.innerHTML = `
                            <div class="lb-pos">${idx + 1}</div>
                            <div class="lb-avatar">${p.avatar}</div>
                            <div class="lb-details">
                                <span class="lb-name">${p.name}</span>
                                <span class="lb-level">${p.rank}</span>
                            </div>
                            <div class="lb-coins">${p.coins.toLocaleString('de-DE')} 🪙</div>
                        `;
                        board.appendChild(item);
                    });
                })
                .catch(err => {
                    console.error("Leaderboard fetch failed, falling back to local simulation:", err);
                    this.renderLocalLeaderboard();
                });
        } else {
            this.renderLocalLeaderboard();
        }
    }

    renderLocalLeaderboard() {
        const board = document.getElementById('leaderboard-list');
        board.innerHTML = '';

        const list = BOT_POOL.map(b => ({
            name: b.name,
            avatar: b.avatar,
            coins: b.coins,
            rank: b.rank,
            isUser: false
        }));

        list.push({
            name: `${this.player.name} (Du)`,
            avatar: this.player.avatar,
            coins: this.player.coins,
            rank: this.player.rankName,
            isUser: true
        });

        list.sort((a, b) => b.coins - a.coins);

        list.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = `leaderboard-item ${p.isUser ? 'rank-user' : ''}`;
            item.innerHTML = `
                <div class="lb-pos">${idx + 1}</div>
                <div class="lb-avatar">${p.avatar}</div>
                <div class="lb-details">
                    <span class="lb-name">${p.name}</span>
                    <span class="lb-level">${p.rank}</span>
                </div>
                <div class="lb-coins">${p.coins.toLocaleString('de-DE')} 🪙</div>
            `;
            board.appendChild(item);
        });
    }

    startBackgroundSimulations() {
        setInterval(() => {
            if (this.currentPhase !== 'LOBBY') return;
            const casualCount = document.getElementById('count-table-casual');
            const standardCount = document.getElementById('count-table-standard');
            const vipCount = document.getElementById('count-table-vip');
            
            if (casualCount) {
                casualCount.textContent = `${Math.floor(10 + Math.random() * 8)} / 20`;
                standardCount.textContent = `${Math.floor(5 + Math.random() * 6)} / 20`;
                vipCount.textContent = `${Math.floor(1 + Math.random() * 4)} / 20`;
            }

            BOT_POOL.forEach(bot => {
                const shift = Math.floor((Math.random() - 0.48) * 100);
                bot.coins = Math.max(100, bot.coins + shift);
            });
        }, 8000);
    }

    // ==========================================================================
    // MULTIPLAYER MATCHMAKING LOGIC (FIREBASE SYNC OR OFFLINE BOTS)
    // ==========================================================================
    startMatchmaking(tableId) {
        sound.init();
        sound.playClick();
        
        const minBets = { casual: 10, standard: 100, vip: 500 };
        const label = { casual: 'Neon Lounge', standard: 'Golden Riviera', vip: 'Royal Velvet' };
        
        if (this.player.coins < minBets[tableId]) {
            alert(`❌ Nicht genügend Münzen! Du benötigst mindestens ${minBets[tableId]} 🪙.`);
            return;
        }

        this.activeTable = tableId;
        this.currentPhase = 'MATCHMAKING';
        this.showScreen(this.screenMatchmaking);

        document.getElementById('matchmaking-title').textContent = "Suche nach Tisch...";
        document.getElementById('matchmaking-subtitle').textContent = `${label[tableId]} (Min. Einsatz: ${minBets[tableId]} 🪙)`;
        
        // Reset slot displays
        const slotUser = document.getElementById('mm-slot-user');
        slotUser.querySelector('.slot-name').textContent = this.player.name;
        slotUser.querySelector('.slot-avatar').innerHTML = `<img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%231F2937'/><text x='50' y='60' font-size='35' text-anchor='middle' fill='%23F59E0B'>${this.player.avatar}</text></svg>">`;
        slotUser.querySelector('.slot-rank').textContent = `Lvl ${this.player.level}`;

        const slot2 = document.getElementById('mm-slot-2');
        slot2.className = 'player-slot empty';
        slot2.querySelector('.slot-avatar').textContent = '?';
        slot2.querySelector('.slot-name').textContent = 'Suche...';
        slot2.querySelector('.slot-rank').textContent = '-';

        const slot3 = document.getElementById('mm-slot-3');
        slot3.className = 'player-slot empty';
        slot3.querySelector('.slot-avatar').textContent = '?';
        slot3.querySelector('.slot-name').textContent = 'Suche...';
        slot3.querySelector('.slot-rank').textContent = '-';

        const statusText = document.getElementById('matchmaking-status-text');
        statusText.textContent = isFirebaseEnabled 
            ? "Verbindung mit Cloud-Lobby wird hergestellt..." 
            : "Suche nach freien Plätzen am Tisch...";

        if (isFirebaseEnabled) {
            this.runCloudMatchmaking(tableId);
        } else {
            this.runLocalMatchmaking(tableId);
        }
    }

    runLocalMatchmaking(tableId) {
        // Fallback simulated local search
        setTimeout(() => {
            if (this.currentPhase !== 'MATCHMAKING') return;
            const slot2 = document.getElementById('mm-slot-2');
            const slot3 = document.getElementById('mm-slot-3');
            const statusText = document.getElementById('matchmaking-status-text');
            
            statusText.textContent = "Tisch gefunden! Warte auf Mitspieler...";
            
            setTimeout(() => {
                if (this.currentPhase !== 'MATCHMAKING') return;
                const eligibleBots = BOT_POOL.filter(b => b.coins >= { casual: 10, standard: 100, vip: 500 }[tableId]);
                const bot1 = eligibleBots[Math.floor(Math.random() * eligibleBots.length)];
                
                this.seats.left = { active: true, name: bot1.name, avatar: bot1.avatar, coins: bot1.coins, rank: bot1.rank, hand: [], score: 0, bet: 0, stand: false, bust: false, isReal: false };
                slot2.className = 'player-slot active';
                slot2.querySelector('.slot-avatar').textContent = bot1.avatar;
                slot2.querySelector('.slot-name').textContent = bot1.name;
                slot2.querySelector('.slot-rank').textContent = bot1.rank;
                statusText.textContent = `Spieler ${bot1.name} beigetreten.`;
                sound.playClick();

                setTimeout(() => {
                    if (this.currentPhase !== 'MATCHMAKING') return;
                    const remainingBots = eligibleBots.filter(b => b.name !== bot1.name);
                    const bot2 = remainingBots[Math.floor(Math.random() * remainingBots.length)] || eligibleBots[0];
                    
                    this.seats.right = { active: true, name: bot2.name, avatar: bot2.avatar, coins: bot2.coins, rank: bot2.rank, hand: [], score: 0, bet: 0, stand: false, bust: false, isReal: false };
                    slot3.className = 'player-slot active';
                    slot3.querySelector('.slot-avatar').textContent = bot2.avatar;
                    slot3.querySelector('.slot-name').textContent = bot2.name;
                    slot3.querySelector('.slot-rank').textContent = bot2.rank;
                    statusText.textContent = `Spieler ${bot2.name} beigetreten.`;
                    sound.playClick();

                    setTimeout(() => {
                        if (this.currentPhase !== 'MATCHMAKING') return;
                        statusText.textContent = "Spiel startet...";
                        document.getElementById('matchmaking-title').textContent = "BEREIT!";
                        setTimeout(() => this.enterGameTable(), 1000);
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 1000);
    }

    runCloudMatchmaking(tableId) {
        const queueRef = db.collection('matchmaking_queue').doc(this.userId);
        
        // Add player to searching queue
        queueRef.set({
            userId: this.userId,
            name: this.player.name,
            avatar: this.player.avatar,
            coins: this.player.coins,
            rank: this.player.rankName,
            level: this.player.level,
            tableId: tableId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            // Find rooms or create new one
            db.collection('table_sessions')
                .where('tableId', '==', tableId)
                .where('status', '==', 'betting')
                .limit(1).get()
                .then(snapshot => {
                    if (this.currentPhase !== 'MATCHMAKING') return;

                    if (!snapshot.empty) {
                        // Join existing open table session
                        const sessionDoc = snapshot.docs[0];
                        this.joinCloudSession(sessionDoc);
                    } else {
                        // Create a new session as host
                        this.createCloudSession(tableId);
                    }
                });
        }).catch(err => {
            console.error("Matchmaking registration failed, falling back to local bots:", err);
            this.runLocalMatchmaking(tableId);
        });
    }

    createCloudSession(tableId) {
        this.isHost = true;
        const newSessionId = 'session_' + Math.random().toString(36).substr(2, 9);
        this.sessionDocRef = db.collection('table_sessions').doc(newSessionId);

        // Host sits at Center position
        const initialData = {
            sessionId: newSessionId,
            tableId: tableId,
            status: 'betting',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            activeTurnSeat: 'left',
            hostId: this.userId,
            seats: {
                left: { active: false },
                center: {
                    active: true,
                    userId: this.userId,
                    name: this.player.name,
                    avatar: this.player.avatar,
                    coins: this.player.coins,
                    rank: this.player.rankName,
                    cards: [], score: 0, bet: 0, stand: false, bust: false, isReal: true
                },
                right: { active: false },
                dealer: { cards: [], score: 0 }
            }
        };

        this.sessionDocRef.set(initialData).then(() => {
            this.subscribeToSession();
            
            // Host waits 4 seconds for other real players, then fills empty slots with bots
            this.matchmakingTimeout = setTimeout(() => {
                if (this.currentPhase !== 'MATCHMAKING') return;
                this.fillEmptySeatsWithBotsAndStart(tableId);
            }, 4000);
        });
    }

    fillEmptySeatsWithBotsAndStart(tableId) {
        if (!this.isHost) return;

        this.sessionDocRef.get().then(doc => {
            const data = doc.data();
            const seats = data.seats;
            const eligibleBots = BOT_POOL.filter(b => b.coins >= { casual: 10, standard: 100, vip: 500 }[tableId]);

            // Fill Left seat if still empty
            if (!seats.left.active) {
                const bot1 = eligibleBots[Math.floor(Math.random() * eligibleBots.length)];
                seats.left = {
                    active: true,
                    name: bot1.name,
                    avatar: bot1.avatar,
                    coins: bot1.coins,
                    rank: bot1.rank,
                    cards: [], score: 0, bet: 0, stand: false, bust: false, isReal: false
                };
            }

            // Fill Right seat if still empty
            if (!seats.right.active) {
                const remainingBots = eligibleBots.filter(b => b.name !== seats.left.name);
                const bot2 = remainingBots[Math.floor(Math.random() * remainingBots.length)] || eligibleBots[0];
                seats.right = {
                    active: true,
                    name: bot2.name,
                    avatar: bot2.avatar,
                    coins: bot2.coins,
                    rank: bot2.rank,
                    cards: [], score: 0, bet: 0, stand: false, bust: false, isReal: false
                };
            }

            // Start the game round session!
            this.sessionDocRef.update({
                seats: seats,
                status: 'ready' // updates listeners
            });
        });
    }

    joinCloudSession(sessionDoc) {
        this.isHost = false;
        this.sessionDocRef = sessionDoc.ref;
        const data = sessionDoc.data();
        const seats = data.seats;

        // Determine which seat is free (Left or Right)
        let chosenSeat = null;
        if (!seats.left.active) {
            chosenSeat = 'left';
        } else if (!seats.right.active) {
            chosenSeat = 'right';
        }

        if (chosenSeat) {
            seats[chosenSeat] = {
                active: true,
                userId: this.userId,
                name: this.player.name,
                avatar: this.player.avatar,
                coins: this.player.coins,
                rank: this.player.rankName,
                cards: [], score: 0, bet: 0, stand: false, bust: false, isReal: true
            };

            this.sessionDocRef.update({
                seats: seats
            }).then(() => {
                this.subscribeToSession();
            });
        } else {
            // Room is full, create a new session instead
            this.createCloudSession(this.activeTable);
        }
    }

    subscribeToSession() {
        // Listen for real-time Firebase changes
        this.sessionListener = this.sessionDocRef.onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();

            // Matchmaking phase visualization update
            if (this.currentPhase === 'MATCHMAKING') {
                const slot2 = document.getElementById('mm-slot-2');
                const slot3 = document.getElementById('mm-slot-3');
                
                // Map Left seat
                if (data.seats.left.active) {
                    slot2.className = 'player-slot active';
                    slot2.querySelector('.slot-avatar').textContent = data.seats.left.avatar;
                    slot2.querySelector('.slot-name').textContent = data.seats.left.name;
                    slot2.querySelector('.slot-rank').textContent = data.seats.left.isReal ? data.seats.left.rank : 'BOT';
                }

                // Map Right seat
                if (data.seats.right.active) {
                    slot3.className = 'player-slot active';
                    slot3.querySelector('.slot-avatar').textContent = data.seats.right.avatar;
                    slot3.querySelector('.slot-name').textContent = data.seats.right.name;
                    slot3.querySelector('.slot-rank').textContent = data.seats.right.isReal ? data.seats.right.rank : 'BOT';
                }

                // If host set state to ready, launch the table interface
                if (data.status === 'ready' || data.status === 'playing_bets') {
                    this.enterGameTable();
                }
            } else if (this.currentPhase.startsWith('TABLE_')) {
                this.syncTableWithCloudData(data);
            }
        });
    }

    leaveMatchmaking() {
        if (isFirebaseEnabled) {
            db.collection('matchmaking_queue').doc(this.userId).delete();
            if (this.sessionListener) this.sessionListener();
            if (this.sessionDocRef && this.isHost) {
                this.sessionDocRef.delete();
            }
        }
        if (this.matchmakingTimeout) clearTimeout(this.matchmakingTimeout);
        this.currentPhase = 'LOBBY';
        this.showScreen(this.screenLobby);
        this.renderLobby();
    }

    // ==========================================================================
    // CLOUD MULTIPLAYER GAMEPLAY AND SYNCRONIZER ENGINE
    // ==========================================================================
    syncTableWithCloudData(data) {
        // Sync our local model representation with Firebase document fields
        const mapCloudSeatToLocal = (localKey, cloudSeat) => {
            if (cloudSeat.active) {
                this.seats[localKey].active = true;
                this.seats[localKey].name = cloudSeat.name;
                this.seats[localKey].avatar = cloudSeat.avatar;
                this.seats[localKey].coins = cloudSeat.coins;
                this.seats[localKey].rank = cloudSeat.rank;
                this.seats[localKey].bet = cloudSeat.bet;
                this.seats[localKey].stand = cloudSeat.stand;
                this.seats[localKey].bust = cloudSeat.bust;
                this.seats[localKey].isReal = cloudSeat.isReal;

                // Map cards
                const prevLength = this.seats[localKey].hand.length;
                if (cloudSeat.cards.length !== prevLength) {
                    this.seats[localKey].hand = cloudSeat.cards.map(c => new Card(SUITS[c.suit.toUpperCase()], c.rank, c.value));
                    this.renderSeatCards(localKey, this.seats[localKey].hand);
                }
            } else {
                this.seats[localKey].active = false;
            }
        };

        // Read seats based on what position we occupy (Host occupies Center)
        if (this.userId === data.hostId) {
            // We are Center. Left and Right seats align directly
            mapCloudSeatToLocal('left', data.seats.left);
            mapCloudSeatToLocal('right', data.seats.right);
            
            // Sync user bet circles locally
            this.seats.user.bet = data.seats.center.bet;
            this.seats.user.stand = data.seats.center.stand;
            this.seats.user.bust = data.seats.center.bust;
            
            const prevUserLen = this.seats.user.hand.length;
            if (data.seats.center.cards.length !== prevUserLen) {
                this.seats.user.hand = data.seats.center.cards.map(c => new Card(SUITS[c.suit.toUpperCase()], c.rank, c.value));
                this.renderSeatCards('user', this.seats.user.hand);
            }
        } else {
            // We are either Left or Right player
            const ourSeatKey = (data.seats.left.userId === this.userId) ? 'left' : 'right';

            if (ourSeatKey === 'left') {
                // Client at Left seat:
                // Local Center (user) -> Cloud Left
                // Local Left (ai-left) -> Cloud Center (Host)
                // Local Right (ai-right) -> Cloud Right
                mapCloudSeatToLocal('left', data.seats.center);
                mapCloudSeatToLocal('right', data.seats.right);
            } else {
                // Client at Right seat:
                // Local Center (user) -> Cloud Right
                // Local Left (ai-left) -> Cloud Left
                // Local Right (ai-right) -> Cloud Center (Host)
                mapCloudSeatToLocal('left', data.seats.left);
                mapCloudSeatToLocal('right', data.seats.center);
            }

            // Sync User state (corresponds to ourSeatKey in Cloud)
            this.seats.user.bet = data.seats[ourSeatKey].bet;
            this.seats.user.stand = data.seats[ourSeatKey].stand;
            this.seats.user.bust = data.seats[ourSeatKey].bust;
            
            const prevUserLen = this.seats.user.hand.length;
            if (data.seats[ourSeatKey].cards.length !== prevUserLen) {
                this.seats.user.hand = data.seats[ourSeatKey].cards.map(c => new Card(SUITS[c.suit.toUpperCase()], c.rank, c.value));
                this.renderSeatCards('user', this.seats.user.hand);
            }
        }

        // Sync Dealer Hand
        const prevDealerLen = this.seats.dealer.hand.length;
        if (data.seats.dealer.cards.length !== prevDealerLen) {
            this.seats.dealer.hand = data.seats.dealer.cards.map(c => new Card(SUITS[c.suit.toUpperCase()], c.rank, c.value));
            
            // Render dealer cards (Host handles down-card state, clients check details)
            const dealerContainer = document.getElementById('dealer-hand');
            dealerContainer.innerHTML = '';
            this.seats.dealer.hand.forEach((card, idx) => {
                const isDown = (idx === 1 && data.status !== 'dealer_playing' && data.status !== 'round_outcome' && !this.isHost);
                dealerContainer.appendChild(card.render(isDown));
            });
        }

        this.calculateScores();
        this.revealTableScores();
        this.updateTableBetDisplays();
        this.updateSeatProfilesUI();

        // Update Phase transitions from Cloud
        if (data.status === 'ready' && this.currentPhase !== 'TABLE_BETTING') {
            this.currentPhase = 'TABLE_BETTING';
            this.prepareBettingPhase();
        } else if (data.status === 'dealing' && this.currentPhase !== 'TABLE_DEALING') {
            this.currentPhase = 'TABLE_DEALING';
            document.getElementById('controls-betting').classList.add('hidden');
        } else if (data.status === 'playing_turns') {
            this.currentPhase = 'TABLE_PLAYING';
            this.activeTurnSeat = data.activeTurnSeat;
            
            // Check if it is our turn
            const isOurTurn = (this.isHost && this.activeTurnSeat === 'center') || 
                              (!this.isHost && data.seats[this.activeTurnSeat].userId === this.userId);
            
            if (isOurTurn) {
                this.enableUserControls();
                document.getElementById('seat-user').classList.add('active-turn');
            } else {
                this.disableUserControls();
                // Glow seat under active turn
                document.querySelectorAll('.seat').forEach(s => s.classList.remove('active-turn'));
                if (this.activeTurnSeat === 'left') document.getElementById('seat-ai-left').classList.add('active-turn');
                if (this.activeTurnSeat === 'right') document.getElementById('seat-ai-right').classList.add('active-turn');
            }
        } else if (data.status === 'dealer_playing' && this.currentPhase !== 'TABLE_DEALER') {
            this.currentPhase = 'TABLE_DEALER';
            this.disableUserControls();
        } else if (data.status === 'round_outcome' && this.currentPhase !== 'TABLE_OUTCOME') {
            this.currentPhase = 'TABLE_OUTCOME';
            this.evaluateGameOutcomes();
        }
    }

    renderSeatCards(seatKey, hand) {
        const container = document.getElementById(`${seatKey === 'user' ? 'user' : (seatKey === 'left' ? 'ai-left' : 'ai-right')}-hand`);
        container.innerHTML = '';
        hand.forEach(card => container.appendChild(card.render()));
    }

    updateSeatProfilesUI() {
        const setProfileUI = (seatKey, profile) => {
            const avatarEl = document.getElementById(`${seatKey}-avatar`);
            const nameEl = document.getElementById(`${seatKey}-name`);
            const coinsEl = document.getElementById(`${seatKey}-coins`);
            const seatEl = document.getElementById(`seat-${seatKey}`);
            
            if (avatarEl && nameEl && coinsEl && seatEl) {
                if (profile.active) {
                    avatarEl.textContent = profile.avatar;
                    nameEl.textContent = profile.name;
                    coinsEl.textContent = `🪙 ${profile.coins.toLocaleString('de-DE')}`;
                    seatEl.style.display = 'flex';
                } else {
                    seatEl.style.display = 'none';
                }
            }
        };

        setProfileUI('ai-left', this.seats.left);
        setProfileUI('ai-right', this.seats.right);
        
        // Update user profile display just in case
        const userAvatar = document.getElementById('user-avatar-game');
        const userName = document.getElementById('user-name-game');
        const userCoins = document.getElementById('user-coins-game');
        if (userAvatar) userAvatar.textContent = this.player.avatar;
        if (userName) userName.textContent = this.player.name;
        if (userCoins) userCoins.textContent = `🪙 ${this.player.coins.toLocaleString('de-DE')}`;
    }

    // ==========================================================================
    // CORE PLAY ACTIONS AND GAMEPLAY LOOPS
    // ==========================================================================
    enterGameTable() {
        this.currentPhase = 'TABLE_BETTING';
        this.showScreen(this.screenTable);

        const minBets = { casual: 10, standard: 100, vip: 500 };
        const label = { casual: 'Neon Lounge', standard: 'Golden Riviera', vip: 'Royal Velvet' };
        document.getElementById('table-info-label').textContent = `${label[this.activeTable]} - Min: ${minBets[this.activeTable]} 🪙`;

        this.updateSeatProfilesUI();

        this.seats.user.bet = 0;
        this.seats.left.bet = 0;
        this.seats.right.bet = 0;

        this.resetHands();
        this.updateTableBetDisplays();
        this.prepareBettingPhase();
    }

    resetHands() {
        document.getElementById('dealer-hand').innerHTML = '';
        document.getElementById('ai-left-hand').innerHTML = '';
        document.getElementById('user-hand').innerHTML = '';
        document.getElementById('ai-right-hand').innerHTML = '';

        document.getElementById('dealer-hand-score').classList.add('hidden');
        document.getElementById('ai-left-hand-score').classList.add('hidden');
        document.getElementById('user-hand-score').classList.add('hidden');
        document.getElementById('ai-right-hand-score').classList.add('hidden');

        for (const k in this.seats) {
            this.seats[k].hand = [];
            this.seats[k].score = 0;
            this.seats[k].stand = false;
            this.seats[k].bust = false;
            
            const bub = document.getElementById(`${k === 'user' ? 'user' : (k === 'left' ? 'ai-left' : 'ai-right')}-bubble`);
            if (bub) bub.classList.remove('visible');
        }

        document.getElementById('game-outcome-banner').classList.add('hidden');
        document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
    }

    updateTableBetDisplays() {
        document.getElementById('user-bet-amount').textContent = this.seats.user.bet;
        document.getElementById('ai-left-bet-amount').textContent = this.seats.left.bet;
        document.getElementById('ai-right-bet-amount').textContent = this.seats.right.bet;

        const userStack = document.getElementById('user-chip-stack');
        userStack.innerHTML = '';
        
        let tempBet = this.seats.user.bet;
        const chipsValues = [1000, 500, 100, 50, 10];
        let offset = 0;
        
        chipsValues.forEach(val => {
            const count = Math.floor(tempBet / val);
            tempBet %= val;
            for (let i = 0; i < count && offset < 10; i++) {
                const chip = document.createElement('div');
                chip.className = `stacked-chip chip-${val === 1000 ? '1000' : val}`;
                chip.style.bottom = `${offset * 3}px`;
                chip.style.left = `${offset * 1}px`;
                userStack.appendChild(chip);
                offset++;
            }
        });

        const btnDeal = document.getElementById('btn-deal-cards');
        const minBet = { casual: 10, standard: 100, vip: 500 }[this.activeTable];
        
        // In cloud sync: only the host can click "Deal Cards"
        if (this.seats.user.bet >= minBet) {
            if (isFirebaseEnabled && !this.isHost) {
                btnDeal.classList.add('disabled');
                btnDeal.textContent = "Warte auf Host...";
            } else {
                btnDeal.classList.remove('disabled');
                btnDeal.textContent = "Karten geben";
            }
        } else {
            btnDeal.classList.add('disabled');
            btnDeal.textContent = "Karten geben";
        }
    }

    prepareBettingPhase() {
        this.currentPhase = 'TABLE_BETTING';
        document.getElementById('controls-betting').classList.remove('hidden');
        document.getElementById('controls-playing').classList.add('hidden');

        // AI Players place bets
        if (!isFirebaseEnabled) {
            if (this.seats.left.active) {
                setTimeout(() => {
                    const range = this.botBetRange[this.activeTable];
                    const bet = Math.floor((range[0] + Math.random() * (range[1] - range[0])) / 10) * 10;
                    this.seats.left.bet = Math.min(bet, this.seats.left.coins);
                    this.updateTableBetDisplays();
                    sound.playChipDrop();
                }, 600);
            }

            if (this.seats.right.active) {
                setTimeout(() => {
                    const range = this.botBetRange[this.activeTable];
                    const bet = Math.floor((range[0] + Math.random() * (range[1] - range[0])) / 10) * 10;
                    this.seats.right.bet = Math.min(bet, this.seats.right.coins);
                    this.updateTableBetDisplays();
                    sound.playChipDrop();
                }, 1100);
            }
        }
    }

    addUserBet(amount) {
        if (this.currentPhase !== 'TABLE_BETTING') return;
        
        const projected = this.seats.user.bet + amount;
        if (projected > this.player.coins) {
            sound.playClick();
            alert("❌ Nicht genug Münzen!");
            return;
        }

        this.seats.user.bet = projected;
        sound.playChipDrop();
        this.updateTableBetDisplays();

        // Update Cloud Session representation if online
        if (isFirebaseEnabled) {
            this.sessionDocRef.get().then(doc => {
                const data = doc.data();
                const seatKey = this.isHost ? 'center' : (data.seats.left.userId === this.userId ? 'left' : 'right');
                
                data.seats[seatKey].bet = this.seats.user.bet;
                this.sessionDocRef.update({ seats: data.seats });
            });
        }
    }

    clearUserBet() {
        if (this.currentPhase !== 'TABLE_BETTING') return;
        this.seats.user.bet = 0;
        this.updateTableBetDisplays();

        if (isFirebaseEnabled) {
            this.sessionDocRef.get().then(doc => {
                const data = doc.data();
                const seatKey = this.isHost ? 'center' : (data.seats.left.userId === this.userId ? 'left' : 'right');
                
                data.seats[seatKey].bet = 0;
                this.sessionDocRef.update({ seats: data.seats });
            });
        }
    }

    startGameRound() {
        if (isFirebaseEnabled && !this.isHost) return; // Only host starts

        this.currentPhase = 'TABLE_DEALING';
        document.getElementById('controls-betting').classList.add('hidden');

        if (isFirebaseEnabled) {
            // Host transitions cloud status to dealing
            this.sessionDocRef.update({ status: 'dealing' });
            
            // Deduct coins from all active participants
            this.sessionDocRef.get().then(doc => {
                const data = doc.data();
                const seats = data.seats;

                // Shuffling
                this.deck.shuffle();
                
                // Draw 2 cards for everyone
                const serialize = (card) => ({ suit: card.suit.name, rank: card.rank, value: card.value });

                const drawForSeat = (seatObj) => {
                    if (!seatObj.active) return;
                    const c1 = this.deck.draw();
                    const c2 = this.deck.draw();
                    seatObj.cards = [serialize(c1), serialize(c2)];
                    seatObj.coins -= seatObj.bet;
                };

                drawForSeat(seats.left);
                drawForSeat(seats.center);
                drawForSeat(seats.right);

                // Dealer cards
                const d1 = this.deck.draw();
                const d2 = this.deck.draw();
                seats.dealer.cards = [serialize(d1), serialize(d2)];

                // Update session
                this.sessionDocRef.update({
                    seats: seats,
                    status: 'playing_turns',
                    activeTurnSeat: 'left' // starts Left
                });
            });
        } else {
            // Local game offline dealing loop
            this.player.coins -= this.seats.user.bet;
            this.seats.user.coins = this.player.coins;
            document.getElementById('user-coins-game').textContent = `🪙 ${this.player.coins.toLocaleString('de-DE')}`;
            this.updateHUD();

            if (this.seats.left.active) {
                this.seats.left.coins -= this.seats.left.bet;
                document.getElementById('ai-left-coins').textContent = `🪙 ${this.seats.left.coins.toLocaleString('de-DE')}`;
            }
            if (this.seats.right.active) {
                this.seats.right.coins -= this.seats.right.bet;
                document.getElementById('ai-right-coins').textContent = `🪙 ${this.seats.right.coins.toLocaleString('de-DE')}`;
            }

            const dealQueue = [];
            if (this.seats.left.active) dealQueue.push('left');
            dealQueue.push('user');
            if (this.seats.right.active) dealQueue.push('right');
            dealQueue.push('dealer-up');

            if (this.seats.left.active) dealQueue.push('left');
            dealQueue.push('user');
            if (this.seats.right.active) dealQueue.push('right');
            dealQueue.push('dealer-down');

            let queueIdx = 0;
            
            const dealNextCard = () => {
                if (queueIdx >= dealQueue.length) {
                    this.calculateScores();
                    this.revealTableScores();
                    setTimeout(() => this.startPlayerTurns(), 500);
                    return;
                }

                const target = dealQueue[queueIdx];
                sound.playCardSwoosh();

                if (target === 'dealer-down') {
                    this.dealerDownCard = this.deck.draw();
                    this.seats.dealer.hand.push(this.dealerDownCard);
                    const cardDOM = this.dealerDownCard.render(true);
                    cardDOM.id = 'dealer-hidden-card';
                    document.getElementById('dealer-hand').appendChild(cardDOM);
                } else if (target === 'dealer-up') {
                    const card = this.deck.draw();
                    this.seats.dealer.hand.push(card);
                    document.getElementById('dealer-hand').appendChild(card.render());
                } else if (target === 'left') {
                    const card = this.deck.draw();
                    this.seats.left.hand.push(card);
                    document.getElementById('ai-left-hand').appendChild(card.render());
                } else if (target === 'right') {
                    const card = this.deck.draw();
                    this.seats.right.hand.push(card);
                    document.getElementById('ai-right-hand').appendChild(card.render());
                } else if (target === 'user') {
                    const card = this.deck.draw();
                    this.seats.user.hand.push(card);
                    document.getElementById('user-hand').appendChild(card.render());
                }

                queueIdx++;
                document.getElementById('deck-cards-remaining').textContent = this.deck.remaining;
                setTimeout(dealNextCard, 400);
            };

            dealNextCard();
        }
    }

    calculateScores() {
        const compute = (hand) => {
            let score = 0;
            let aces = 0;
            hand.forEach(card => {
                score += card.value;
                if (card.rank === 'A') aces++;
            });
            while (score > 21 && aces > 0) {
                score -= 10;
                aces--;
            }
            return score;
        };

        if (this.seats.left.active) this.seats.left.score = compute(this.seats.left.hand);
        this.seats.user.score = compute(this.seats.user.hand);
        if (this.seats.right.active) this.seats.right.score = compute(this.seats.right.hand);
        this.seats.dealer.score = compute(this.seats.dealer.hand);
    }

    revealTableScores() {
        const showScoreDOM = (id, score, isBusted) => {
            const el = document.getElementById(id);
            el.textContent = score;
            el.classList.remove('hidden');
            if (isBusted) {
                el.style.borderColor = 'var(--danger)';
                el.style.color = 'var(--danger)';
            } else {
                el.style.borderColor = 'var(--gold)';
                el.style.color = '#fff';
            }
        };

        if (this.seats.left.active) showScoreDOM('ai-left-hand-score', this.seats.left.score, this.seats.left.score > 21);
        showScoreDOM('user-hand-score', this.seats.user.score, this.seats.user.score > 21);
        if (this.seats.right.active) showScoreDOM('ai-right-hand-score', this.seats.right.score, this.seats.right.score > 21);
        
        // Hide dealer second card value until revealed
        const isRevealed = (this.currentPhase === 'TABLE_DEALER' || this.currentPhase === 'TABLE_OUTCOME');
        const visibleDealerScore = isRevealed 
            ? this.seats.dealer.score
            : (this.seats.dealer.hand.length > 0 ? (this.seats.dealer.hand[0].rank === 'A' ? 11 : this.seats.dealer.hand[0].value) : 0);
        
        showScoreDOM('dealer-hand-score', visibleDealerScore, isRevealed && this.seats.dealer.score > 21);
    }

    startPlayerTurns() {
        this.currentPhase = 'TABLE_PLAYING';
        this.activeTurnSeat = 'left';
        this.moveToNextTurn();
    }

    moveToNextTurn() {
        document.querySelectorAll('.seat').forEach(s => s.classList.remove('active-turn'));

        if (isFirebaseEnabled) {
            // Session transitions are managed via Cloud sync
            return;
        }

        if (this.activeTurnSeat === 'left') {
            if (this.seats.left.active && this.seats.left.score < 21) {
                document.getElementById('seat-ai-left').classList.add('active-turn');
                this.executeBOTTurn('left');
            } else {
                this.activeTurnSeat = 'user';
                this.moveToNextTurn();
            }
        } else if (this.activeTurnSeat === 'user') {
            if (this.seats.user.score < 21) {
                document.getElementById('seat-user').classList.add('active-turn');
                this.enableUserControls();
            } else {
                this.seats.user.stand = true;
                this.activeTurnSeat = 'right';
                this.moveToNextTurn();
            }
        } else if (this.activeTurnSeat === 'right') {
            if (this.seats.right.active && this.seats.right.score < 21) {
                document.getElementById('seat-ai-right').classList.add('active-turn');
                this.executeBOTTurn('right');
            } else {
                this.activeTurnSeat = 'dealer';
                this.moveToNextTurn();
            }
        } else if (this.activeTurnSeat === 'dealer') {
            this.executeDealerTurn();
        }
    }

    // --- AI BOT OFF-LINE DECISIONS ---
    executeBOTTurn(seatKey) {
        const bot = this.seats[seatKey];
        const dealerUpCardVal = this.seats.dealer.hand[0].value;

        const decide = () => {
            this.calculateScores();
            this.revealTableScores();

            if (bot.score > 21) {
                bot.bust = true;
                this.showBubble(seatKey, "Bust! 💥");
                setTimeout(() => {
                    this.activeTurnSeat = (seatKey === 'left') ? 'user' : 'dealer';
                    this.moveToNextTurn();
                }, 1000);
                return;
            }

            if (bot.score === 21) {
                bot.stand = true;
                this.showBubble(seatKey, "Blackjack! 🎉");
                setTimeout(() => {
                    this.activeTurnSeat = (seatKey === 'left') ? 'user' : 'dealer';
                    this.moveToNextTurn();
                }, 1000);
                return;
            }

            let action = 'STAND';
            if (bot.score <= 11) {
                action = 'HIT';
                if ((bot.score === 10 || bot.score === 11) && dealerUpCardVal <= 9 && bot.coins >= bot.bet) {
                    action = 'DOUBLE';
                }
            } else if (bot.score === 12) {
                action = (dealerUpCardVal >= 4 && dealerUpCardVal <= 6) ? 'STAND' : 'HIT';
            } else if (bot.score >= 13 && bot.score <= 16) {
                action = (dealerUpCardVal <= 6) ? 'STAND' : 'HIT';
            } else if (bot.score >= 17) {
                action = 'STAND';
            }

            if (action === 'HIT') {
                this.showBubble(seatKey, "Karte (Hit)");
                setTimeout(() => {
                    const card = this.deck.draw();
                    bot.hand.push(card);
                    document.getElementById(`${seatKey === 'left' ? 'ai-left' : 'ai-right'}-hand`).appendChild(card.render());
                    sound.playCardSwoosh();
                    decide();
                }, 1200);
            } else if (action === 'DOUBLE') {
                this.showBubble(seatKey, "Verdoppeln!");
                bot.coins -= bot.bet;
                bot.bet *= 2;
                document.getElementById(`${seatKey === 'left' ? 'ai-left' : 'ai-right'}-coins`).textContent = `🪙 ${bot.coins.toLocaleString('de-DE')}`;
                document.getElementById(`${seatKey === 'left' ? 'ai-left' : 'ai-right'}-bet-amount`).textContent = bot.bet;
                sound.playChipDrop();

                setTimeout(() => {
                    const card = this.deck.draw();
                    bot.hand.push(card);
                    document.getElementById(`${seatKey === 'left' ? 'ai-left' : 'ai-right'}-hand`).appendChild(card.render());
                    sound.playCardSwoosh();
                    this.calculateScores();
                    this.revealTableScores();
                    bot.stand = true;
                    setTimeout(() => {
                        this.activeTurnSeat = (seatKey === 'left') ? 'user' : 'dealer';
                        this.moveToNextTurn();
                    }, 1200);
                }, 1200);
            } else {
                this.showBubble(seatKey, "Halten (Stand)");
                bot.stand = true;
                setTimeout(() => {
                    this.activeTurnSeat = (seatKey === 'left') ? 'user' : 'dealer';
                    this.moveToNextTurn();
                }, 1200);
            }
        };

        setTimeout(decide, 800);
    }

    showBubble(seatKey, msg) {
        const bubble = document.getElementById(`${seatKey === 'user' ? 'user' : (seatKey === 'left' ? 'ai-left' : 'ai-right')}-bubble`);
        if (!bubble) return;
        bubble.textContent = msg;
        bubble.classList.add('visible');
        setTimeout(() => bubble.classList.remove('visible'), 2500);
    }

    // --- USER DOCK CONTROLS ---
    enableUserControls() {
        document.getElementById('controls-playing').classList.remove('hidden');
        const btnDouble = document.getElementById('btn-action-double');
        
        // Double only available on first turn (2 cards)
        if (this.player.coins >= this.seats.user.bet && this.seats.user.hand.length === 2) {
            btnDouble.disabled = false;
            btnDouble.classList.remove('disabled');
        } else {
            btnDouble.disabled = true;
            btnDouble.classList.add('disabled');
        }
    }

    disableUserControls() {
        document.getElementById('controls-playing').classList.add('hidden');
    }

    executeUserAction(action) {
        sound.init();
        if (this.currentPhase !== 'TABLE_PLAYING') return;

        // Verify active turn matches our seat
        if (isFirebaseEnabled) {
            this.sessionDocRef.get().then(doc => {
                const data = doc.data();
                const activeSeat = data.activeTurnSeat;
                if (data.seats[activeSeat].userId !== this.userId) return;

                this.disableUserControls();
                this.executeCloudUserAction(activeSeat, action, data);
            });
            return;
        }

        // Local game Offline Action Logic
        if (this.activeTurnSeat !== 'user') return;
        this.disableUserControls();

        if (action === 'HIT') {
            sound.playClick();
            const card = this.deck.draw();
            this.seats.user.hand.push(card);
            document.getElementById('user-hand').appendChild(card.render());
            sound.playCardSwoosh();

            this.calculateScores();
            this.revealTableScores();

            if (this.seats.user.score > 21) {
                this.seats.user.bust = true;
                this.showBubble('user', "Bust! 💥");
                sound.playLose();
                setTimeout(() => {
                    this.activeTurnSeat = 'right';
                    this.moveToNextTurn();
                }, 1200);
            } else if (this.seats.user.score === 21) {
                this.seats.user.stand = true;
                this.showBubble('user', "21! 🔥");
                setTimeout(() => {
                    this.activeTurnSeat = 'right';
                    this.moveToNextTurn();
                }, 1200);
            } else {
                this.enableUserControls();
            }
        } else if (action === 'STAND') {
            sound.playClick();
            this.seats.user.stand = true;
            this.showBubble('user', "Stand");
            setTimeout(() => {
                this.activeTurnSeat = 'right';
                this.moveToNextTurn();
            }, 800);
        } else if (action === 'DOUBLE') {
            sound.playClick();
            this.player.coins -= this.seats.user.bet;
            this.seats.user.bet *= 2;
            document.getElementById('user-coins-game').textContent = `🪙 ${this.player.coins.toLocaleString('de-DE')}`;
            document.getElementById('user-bet-amount').textContent = this.seats.user.bet;
            this.updateHUD();
            sound.playChipDrop();

            setTimeout(() => {
                const card = this.deck.draw();
                this.seats.user.hand.push(card);
                document.getElementById('user-hand').appendChild(card.render());
                sound.playCardSwoosh();

                this.calculateScores();
                this.revealTableScores();
                this.seats.user.stand = true;

                if (this.seats.user.score > 21) {
                    this.seats.user.bust = true;
                    this.showBubble('user', "Bust! 💥");
                    sound.playLose();
                } else {
                    this.showBubble('user', "Double!");
                }

                setTimeout(() => {
                    this.activeTurnSeat = 'right';
                    this.moveToNextTurn();
                }, 1200);
            }, 800);
        }
    }

    executeCloudUserAction(seatKey, action, data) {
        const seat = data.seats[seatKey];
        const serialize = (card) => ({ suit: card.suit.name, rank: card.rank, value: card.value });

        if (action === 'HIT') {
            // Draw card from Host's deck locally, notify Cloud
            const card = this.deck.draw();
            seat.cards.push(serialize(card));
            
            // Recompute score
            let score = 0;
            let aces = 0;
            seat.cards.forEach(c => {
                score += c.value;
                if (c.rank === 'A') aces++;
            });
            while (score > 21 && aces > 0) {
                score -= 10;
                aces--;
            }

            seat.score = score;
            if (score > 21) {
                seat.bust = true;
                this.advanceCloudTurnSequence(seatKey, data);
            } else if (score === 21) {
                seat.stand = true;
                this.advanceCloudTurnSequence(seatKey, data);
            } else {
                // Keep turn at same player, write updates
                this.sessionDocRef.update({ seats: data.seats });
            }
        } else if (action === 'STAND') {
            seat.stand = true;
            this.advanceCloudTurnSequence(seatKey, data);
        } else if (action === 'DOUBLE') {
            this.player.coins -= seat.bet;
            this.seats.user.coins = this.player.coins;
            document.getElementById('user-coins-game').textContent = `🪙 ${this.player.coins.toLocaleString('de-DE')}`;
            this.updateHUD();
            
            seat.coins = this.player.coins;
            seat.bet *= 2;

            const card = this.deck.draw();
            seat.cards.push(serialize(card));

            let score = 0;
            let aces = 0;
            seat.cards.forEach(c => {
                score += c.value;
                if (c.rank === 'A') aces++;
            });
            while (score > 21 && aces > 0) {
                score -= 10;
                aces--;
            }
            seat.score = score;
            seat.stand = true;
            if (score > 21) seat.bust = true;

            this.advanceCloudTurnSequence(seatKey, data);
        }
    }

    advanceCloudTurnSequence(currentSeat, data) {
        // Sequence: left -> center -> right -> dealer
        let nextSeat = 'dealer';
        if (currentSeat === 'left') {
            nextSeat = data.seats.center.active ? 'center' : (data.seats.right.active ? 'right' : 'dealer');
        } else if (currentSeat === 'center') {
            nextSeat = data.seats.right.active ? 'right' : 'dealer';
        }

        if (nextSeat === 'dealer') {
            // Trigger dealer plays phase
            this.sessionDocRef.update({
                seats: data.seats,
                status: 'dealer_playing'
            }).then(() => {
                // If we are Host, run dealer drawing algorithm
                if (this.isHost) {
                    this.executeCloudDealerTurn(data);
                }
            });
        } else {
            // Advance seat active turn pointer
            this.sessionDocRef.update({
                seats: data.seats,
                activeTurnSeat: nextSeat
            });
        }
    }

    executeCloudDealerTurn(data) {
        const seats = data.seats;
        const serialize = (card) => ({ suit: card.suit.name, rank: card.rank, value: card.value });

        const play = () => {
            let score = 0;
            let aces = 0;
            seats.dealer.cards.forEach(c => {
                score += c.value;
                if (c.rank === 'A') aces++;
            });
            while (score > 21 && aces > 0) {
                score -= 10;
                aces--;
            }
            seats.dealer.score = score;

            const allPlayersBusted = (!seats.left.active || seats.left.bust) &&
                                      seats.center.bust &&
                                      (!seats.right.active || seats.right.bust);

            if (score >= 17 || allPlayersBusted) {
                // Dealer stops drawing
                this.sessionDocRef.update({
                    seats: seats,
                    status: 'round_outcome'
                });
                return;
            }

            // Hit card
            const card = this.deck.draw();
            seats.dealer.cards.push(serialize(card));

            setTimeout(play, 1000);
        };

        play();
    }

    // --- PHASE 4: DEALER PLAY LOOP ---
    executeDealerTurn() {
        this.currentPhase = 'TABLE_DEALER';
        const hiddenDOM = document.getElementById('dealer-hidden-card');
        if (hiddenDOM) {
            hiddenDOM.parentNode.replaceChild(this.dealerDownCard.render(), hiddenDOM);
        }
        
        this.calculateScores();
        const dealerScoreDOM = document.getElementById('dealer-hand-score');
        dealerScoreDOM.textContent = this.seats.dealer.score;
        
        const dealDealerCards = () => {
            this.calculateScores();
            dealerScoreDOM.textContent = this.seats.dealer.score;

            const allPlayersBusted = (!this.seats.left.active || this.seats.left.bust) &&
                                      this.seats.user.bust &&
                                      (!this.seats.right.active || this.seats.right.bust);

            if (this.seats.dealer.score >= 17 || allPlayersBusted) {
                setTimeout(() => this.evaluateGameOutcomes(), 1000);
                return;
            }

            sound.playCardSwoosh();
            const card = this.deck.draw();
            this.seats.dealer.hand.push(card);
            document.getElementById('dealer-hand').appendChild(card.render());
            setTimeout(dealDealerCards, 1000);
        };

        setTimeout(dealDealerCards, 1000);
    }

    // --- PHASE 5: PAYOUT & WINNER STATS EVALUATION ---
    evaluateGameOutcomes() {
        this.currentPhase = 'TABLE_OUTCOME';
        
        const dealerScore = this.seats.dealer.score;
        const dealerBusted = dealerScore > 21;
        
        let userResultText = "VERLOREN";
        let chipsAwarded = 0;
        let xpGained = 5;

        this.player.stats.handsPlayed++;

        const userScore = this.seats.user.score;
        const userBusted = this.seats.user.bust;
        const userHasBlackjack = userScore === 21 && this.seats.user.hand.length === 2;
        const dealerHasBlackjack = dealerScore === 21 && this.seats.dealer.hand.length === 2;

        if (userBusted) {
            userResultText = "BUST (VERLOREN)";
            chipsAwarded = 0;
            xpGained = 5;
        } else if (dealerBusted) {
            userResultText = "GEWONNEN!";
            chipsAwarded = this.seats.user.bet * 2;
            xpGained = 15;
            this.player.stats.handsWon++;
            if (userHasBlackjack) {
                userResultText = "BLACKJACK!";
                chipsAwarded = Math.floor(this.seats.user.bet * 2.5);
                xpGained = 25;
                this.player.stats.blackjacks++;
            }
        } else {
            if (userScore > dealerScore) {
                userResultText = "GEWONNEN!";
                chipsAwarded = this.seats.user.bet * 2;
                xpGained = 15;
                this.player.stats.handsWon++;
                if (userHasBlackjack) {
                    userResultText = "BLACKJACK!";
                    chipsAwarded = Math.floor(this.seats.user.bet * 2.5);
                    xpGained = 25;
                    this.player.stats.blackjacks++;
                }
            } else if (userScore < dealerScore) {
                userResultText = "VERLOREN";
                chipsAwarded = 0;
                xpGained = 5;
            } else {
                if (userHasBlackjack && !dealerHasBlackjack) {
                    userResultText = "BLACKJACK!";
                    chipsAwarded = Math.floor(this.seats.user.bet * 2.5);
                    xpGained = 25;
                    this.player.stats.handsWon++;
                    this.player.stats.blackjacks++;
                } else if (!userHasBlackjack && dealerHasBlackjack) {
                    userResultText = "DEALER BLACKJACK";
                    chipsAwarded = 0;
                    xpGained = 5;
                } else {
                    userResultText = "UNENTSCHIEDEN (PUSH)";
                    chipsAwarded = this.seats.user.bet;
                    xpGained = 10;
                }
            }
        }

        // Add visual chip returns
        this.player.coins += chipsAwarded;
        this.seats.user.coins = this.player.coins;
        
        const banner = document.getElementById('game-outcome-banner');
        banner.querySelector('#outcome-title').textContent = userResultText;
        banner.querySelector('#outcome-chips-won').textContent = chipsAwarded > 0 ? `+ ${chipsAwarded} 🪙` : `0 🪙`;
        banner.querySelector('#outcome-xp-won').textContent = `+ ${xpGained} XP`;
        banner.classList.remove('hidden');

        if (userResultText.includes("GEWONNEN")) {
            sound.playWin();
        } else if (userResultText.includes("BLACKJACK")) {
            sound.playBlackjack();
        } else if (userResultText.includes("PUSH")) {
            sound.playPush();
        } else {
            sound.playLose();
        }

        this.addXP(xpGained);

        // Update companion seats display values
        const updateCompanionUI = (seatKey) => {
            const bot = this.seats[seatKey];
            if (!bot.active) return;
            
            if (isFirebaseEnabled) {
                // In cloud sync: balances are updated via Cloud snapshot sync
                return;
            }

            const botScore = bot.score;
            const botBusted = bot.bust;
            const botHasBlackjack = botScore === 21 && bot.hand.length === 2;

            if (botBusted) {
                // Lost
            } else if (dealerBusted) {
                bot.coins += botHasBlackjack ? Math.floor(bot.bet * 2.5) : bot.bet * 2;
            } else {
                if (botScore > dealerScore) {
                    bot.coins += botHasBlackjack ? Math.floor(bot.bet * 2.5) : bot.bet * 2;
                } else if (botScore === dealerScore) {
                    if (botHasBlackjack && !dealerHasBlackjack) {
                        bot.coins += Math.floor(bot.bet * 2.5);
                    } else if (!botHasBlackjack && dealerHasBlackjack) {
                        // Lost
                    } else {
                        bot.coins += bot.bet;
                    }
                }
            }
            document.getElementById(`${seatKey === 'left' ? 'ai-left' : 'ai-right'}-coins`).textContent = `🪙 ${bot.coins.toLocaleString('de-DE')}`;
        };

        updateCompanionUI('left');
        updateCompanionUI('right');

        // Restart betting phase timer after 4.5s
        setTimeout(() => {
            if (this.player.coins <= 0) {
                alert("💸 Du bist pleite! Das Casino spendiert dir 200 Notfall-Münzen! Kopf hoch!");
                this.player.coins = 200;
                this.saveProfile();
            }

            this.resetHands();
            
            if (isFirebaseEnabled) {
                if (this.isHost) {
                    // Host resets table session back to betting status
                    this.sessionDocRef.get().then(doc => {
                        const data = doc.data();
                        
                        // Clear seat cards, bets, status
                        const resetSeat = (seat) => {
                            if (!seat.active) return;
                            seat.cards = [];
                            seat.score = 0;
                            seat.bet = 0;
                            seat.stand = false;
                            seat.bust = false;
                        };

                        resetSeat(data.seats.left);
                        resetSeat(data.seats.center);
                        resetSeat(data.seats.right);
                        
                        data.seats.dealer = { cards: [], score: 0 };
                        
                        this.sessionDocRef.update({
                            seats: data.seats,
                            status: 'betting',
                            activeTurnSeat: 'left'
                        });
                    });
                }
            } else {
                this.seats.user.bet = 0;
                this.seats.left.bet = 0;
                this.seats.right.bet = 0;
                this.updateTableBetDisplays();
                this.prepareBettingPhase();
            }
        }, 4500);
    }

    leaveGameTable() {
        if (this.seats.user.bet > 0 && ['TABLE_BETTING', 'TABLE_PLAYING', 'TABLE_DEALER'].includes(this.currentPhase)) {
            if (!confirm("Wenn du den Tisch verlässt, verlierst du deinen Einsatz! Möchtest du fortfahren?")) {
                return;
            }
            this.player.coins -= this.seats.user.bet;
            this.saveProfile();
        }

        if (isFirebaseEnabled) {
            // Remove user from active seats list on Firebase
            this.sessionDocRef.get().then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                
                if (this.isHost) {
                    // If Host leaves, close/delete active session
                    this.sessionDocRef.delete();
                } else {
                    const seatKey = (data.seats.left.userId === this.userId) ? 'left' : 'right';
                    data.seats[seatKey] = { active: false };
                    this.sessionDocRef.update({ seats: data.seats });
                }
                
                if (this.sessionListener) this.sessionListener();
            });
        }

        this.currentPhase = 'LOBBY';
        this.showScreen(this.screenLobby);
        this.renderLobby();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const game = new GameManager();
    game.init();
});
