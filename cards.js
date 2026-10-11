export let TAG_CATEGORIES = {};
export let TAG_RANKS = {};
export let HISTORICAL_CARDS_DB = [];

export const RANK_MULTIPLIERS = {
    // バフ倍率 ( { 1枚時, 2枚時, 3枚時 } )
    "S":  { 1: 1.5, 2: 1.8,  3: 2.2 }, // Sランクのみ1枚でも発動
    "A":  { 2: 1.5,  3: 1.8 },
    "B":  { 2: 1.3,  3: 1.5 },
    "C":  { 2: 1.1,  3: 1.3 },

    // デバフ倍率
    "DS": { 1: 0.7, 2: 0.5,  3: 0.3 }, // DSランクのみ1枚でも発動
    "DA": { 2: 0.65, 3: 0.5 },
    "DB": { 2: 0.8,  3: 0.65 },
    "DC": { 2: 0.9,  3: 0.8 }
};

export function setupCardsData(cards, categories, ranks) {
    HISTORICAL_CARDS_DB = cards;
    TAG_CATEGORIES = categories;
    TAG_RANKS = ranks;
}

export function checkAndLoadEmbeddedData() {
    if (window.GAME_CARDS_DATA && window.GAME_TAG_CATEGORIES && window.GAME_TAG_RANKS) {
        setupCardsData(window.GAME_CARDS_DATA, window.GAME_TAG_CATEGORIES, window.GAME_TAG_RANKS);
        return true;
    }
    return false;
}

export function getCard(id) {
    return HISTORICAL_CARDS_DB.find(c => c.id === id) || HISTORICAL_CARDS_DB[0];
}

export function getTagBadgeHTML(tag) {
    const cat = TAG_CATEGORIES[tag] || 'GEN';
    const rank = TAG_RANKS[tag] || 'C';
    const colorClasses = {
        ATK: 'bg-red-950/90 border-red-500/80 text-red-200',
        DEF: 'bg-blue-950/90 border-blue-500/80 text-blue-200',
        SUP: 'bg-amber-950/90 border-amber-500/80 text-amber-200',
        DEB: 'bg-purple-950/90 border-purple-500/80 text-purple-200',
        GEN: 'bg-slate-950/90 border-slate-700 text-cyan-200'
    }[cat];
    
    const isTopRank = rank === 'S' || rank === 'DS';
    const rankColor = isTopRank ? 'text-amber-300 font-black animate-pulse' : 'text-yellow-300 font-bold';
    
    return `<span class="tag-badge border px-1 py-0.5 rounded flex items-center justify-center gap-0.5 truncate shadow-sm ${colorClasses}">${tag} <span class="text-[8px] ${rankColor}">(${rank})</span></span>`;
}