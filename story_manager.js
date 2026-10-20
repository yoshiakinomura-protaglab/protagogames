/**
 * story_manager.js - ストーリー進行・時代クリア・初期配布管理エンジン
 */

const STORY_STORAGE_KEY = 'yamato_story_progress_v1';
const STORY_DECKS_KEY = 'yamato_縁_saved_decks_v1'; // ★ 他スクリプトとの変数名衝突を防ぐため変更

/**
 * ストーリー進捗データの取得
 */
function getStoryData() {
    const raw = localStorage.getItem(STORY_STORAGE_KEY);
    const defaultData = {
        prologueCleared: false, // プロローグ（チュートリアル）完了フラグ
        clearedEras: [],        // クリア済みの時代IDリスト
        endingUnlocked: false   // エンディング達成フラグ
    };
    if (!raw) return defaultData;
    try {
        return { ...defaultData, ...JSON.parse(raw) };
    } catch (e) {
        return defaultData;
    }
}

/**
 * ストーリー進捗データの保存
 */
function saveStoryData(storyData) {
    localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(storyData));
    console.log("💾 [Story] 進捗データを保存しました", storyData);
    window.dispatchEvent(new CustomEvent('yamato_story_updated', { detail: storyData }));
}

/**
 * プロローグ完了時の報酬配布 ＆ クリアフラグ更新
 */
function completePrologueAndGrantDeck(selectedGender = 'male') {
    // 1. 性別に合わせた主人公カードID決定
    const heroCardId = selectedGender === 'female' ? 'c97003' : 'c97001';

    // 2. 指定の初期ノーマル英傑18枚（c97100〜c97118）
    const normalCardIds = [
        'c97100', 'c97101', 'c97102', 'c97103', 'c97104',
        'c97106', 'c97107', 'c97108', 'c97109', 'c97110',
        'c97111', 'c97112', 'c97113', 'c97114', 'c97115',
        'c97116', 'c97117', 'c97118'
    ];

    // 3. 所持コレクションデータの構築（計20枚）
    const initialCol = {};
    initialCol[heroCardId] = 1; // 主人公カード
    initialCol['c95013'] = 1;    // ヨイチ

    normalCardIds.forEach(id => {
        initialCol[id] = 1;
    });

    // 4. hero_manager.js の保存関数を呼び出して所持カードを保存
    if (typeof saveUserCollection === 'function') {
        saveUserCollection(initialCol);
    } else {
        localStorage.setItem('yamato_user_collection', JSON.stringify(initialCol));
    }

    // 5. 主人公初期性別を hero_manager.js 側へ保存
    if (typeof getHeroData === 'function' && typeof saveHeroData === 'function') {
        const hero = getHeroData();
        hero.gender = selectedGender;
        saveHeroData(hero);
    }

    // 6. 初期20枚で「デッキ1」を自動作成・保存（すぐバトルに出撃可能にする）
    const defaultDecks = {};
    for (let i = 1; i <= 10; i++) {
        defaultDecks[i] = {
            id: i,
            name: `デッキ${i}`,
            jokerId: i === 1 ? heroCardId : null,
            cardIds: i === 1 ? ['c95013', ...normalCardIds] : []
        };
    }
    localStorage.setItem(STORY_DECKS_KEY, JSON.stringify(defaultDecks));

    // 7. ストーリー専用セーブデータにプロローグクリアを記録
    const story = getStoryData();
    story.prologueCleared = true;
    saveStoryData(story);

    console.log("🎉 プロローグ完了！指定の初期デッキ(20枚)を配布し、デッキ1として自動編成しました。");
}

// ★ 明示的に window オブジェクトへ紐付けて他ファイルから呼び出せるように公開
window.getStoryData = getStoryData;
window.saveStoryData = saveStoryData;
window.completePrologueAndGrantDeck = completePrologueAndGrantDeck;