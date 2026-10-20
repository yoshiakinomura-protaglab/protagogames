/**
 * hero_manager.js - 主人公データ & 所持カードセーブ管理エンジン
 */

const STORAGE_KEYS = {
    COLLECTION: 'yamato_user_collection',
    HERO: 'yamato_hero_data',
    APP_MODE: 'yamato_app_mode' // 'NORMAL' | 'DEBUG_ALL'
};

// --- モード管理 ---
function getAppMode() {
    return localStorage.getItem(STORAGE_KEYS.APP_MODE) || 'NORMAL';
}

function setAppMode(mode) {
    localStorage.setItem(STORAGE_KEYS.APP_MODE, mode);
    console.log(`🔧 起動モードを [${mode}] に変更しました。`);
    location.reload();
}

// --- 所持カードデータ管理 ---
function getUserCollection() {
    if (getAppMode() === 'DEBUG_ALL') {
        const debugCol = {};
        for (let i = 1; i <= 100; i++) { debugCol[String(i)] = 10; }
        return debugCol;
    }

    const raw = localStorage.getItem(STORAGE_KEYS.COLLECTION);
    if (!raw) return initDefaultCollection();
    try {
        return JSON.parse(raw);
    } catch (e) {
        return initDefaultCollection();
    }
}

/**
 * 初期コレクション生成（cards.csvのID形式に対応）
 */
function initDefaultCollection() {
    const defaultCol = {};
    // 旧データ（数値ID）を消去してcards.csvの先頭20枚（c00000〜c00019）を初期所持にする
    for (let i = 0; i < 20; i++) {
        const padId = 'c' + String(i).padStart(5, '0');
        defaultCol[padId] = 1;
    }
    saveUserCollection(defaultCol);
    return defaultCol;
}

function saveUserCollection(collection) {
    if (getAppMode() === 'DEBUG_ALL') return;
    localStorage.setItem(STORAGE_KEYS.COLLECTION, JSON.stringify(collection));
    console.log("💾 [AutoSave] カード所持データを保存しました", collection);
}

function addCardToCollection(cardId, count = 1) {
    const collection = getUserCollection();
    const idStr = String(cardId);
    collection[idStr] = (collection[idStr] || 0) + Number(count);
    saveUserCollection(collection);
    window.dispatchEvent(new CustomEvent('yamato_collection_updated', { detail: collection }));
    return collection;
}

function getTotalCardCount() {
    const collection = getUserCollection();
    return Object.values(collection).reduce((sum, num) => sum + Number(num), 0);
}

function getHeroFamousLevel() {
    const total = getTotalCardCount();
    return Math.min(1000, 10 + total);
}

// --- 主人公設定データ管理 ---
function getHeroData() {
    const defaultHero = {
        name: '主人公',
        gender: 'male',
        janken: 'gu',
        unlockedTags: ['大和の縁'],
        equippedTags: ['大和の縁', null, null]
    };

    try {
        // ★ STORAGE_KEYS.HERO ('yamato_hero_data') にキーを統一！
        const raw = localStorage.getItem(STORAGE_KEYS.HERO);
        if (raw) {
            const data = JSON.parse(raw);
            return {
                name: data.name || '主人公',
                gender: data.gender || 'male',
                janken: data.janken || 'gu',
                unlockedTags: data.unlockedTags || ['大和の縁'],
                equippedTags: data.equippedTags || ['大和の縁', null, null]
            };
        } else {
            saveHeroData(defaultHero);
            return defaultHero;
        }
    } catch (e) {
        console.error("HeroData取得エラー:", e);
    }

    return defaultHero;
}

function saveHeroData(heroData) {
    localStorage.setItem(STORAGE_KEYS.HERO, JSON.stringify(heroData));
    console.log("💾 [AutoSave] 主人公設定を保存しました", heroData);
    window.dispatchEvent(new CustomEvent('yamato_hero_updated', { detail: heroData }));
}

// --- バックアップ（コード復元/出力） ---
function exportSaveData() {
    const data = {
        collection: getUserCollection(),
        hero: getHeroData(),
        timestamp: Date.now()
    };
    return btoa(encodeURIComponent(JSON.stringify(data)));
}

function importSaveData(base64Code) {
    try {
        const json = decodeURIComponent(atob(base64Code));
        const data = JSON.parse(json);
        if (data.collection) saveUserCollection(data.collection);
        if (data.hero) saveHeroData(data.hero);
        alert("セーブデータの復元に成功しました！");
        location.reload();
        return true;
    } catch (e) {
        alert("無効なセーブコードです。");
        return false;
    }
}