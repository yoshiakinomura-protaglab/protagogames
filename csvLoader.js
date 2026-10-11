/**
 * csvLoader.js - CSVデータ読み込み管理モジュール (キャッシュ回避クエリ適用版)
 */

// cards.csv の読み込み
export async function loadCardsCSV() {
    try {
        const response = await fetch(`cards.csv?v=${new Date().getTime()}`);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        const cards = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
            const cleanValues = values.map(v => v.trim().replace(/^"|"$/g, ''));

            const card = {};
            headers.forEach((header, index) => {
                let val = cleanValues[index] || '';
                if (header === 'tags') {
                    card.tags = val ? val.split(',').map(t => t.trim()) : [];
                } else if (header === 'power' || header === 'num') {
                    card[header] = parseInt(val, 10) || 0;
                } else {
                    card[header] = val;
                }
            });

            card.imageIllust = card.image_illust || `${card.id}_illust.jpg`;
            card.imageReal = card.image_real || `${card.id}_real.jpg`;

            cards.push(card);
        }
        return cards;
    } catch (error) {
        console.error('cards.csv 読み込みエラー:', error);
        return [];
    }
}

// tags.csv の読み込み（完全・パース強化版）
export async function loadTagsCSV() {
    try {
        const response = await fetch(`tags.csv?v=${new Date().getTime()}`);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) return {};

        const tagMaster = {};
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const tagName = values[0];
            if (!tagName) continue;

            // タグ名の表記揺れ対策（トリム）
            const cleanTagName = tagName.replace(/[\(（].*?[\)）]/, '').trim();

            tagMaster[cleanTagName] = {
                category: (values[1] || 'GEN').toUpperCase().trim(),
                rank: (values[2] || 'C').toUpperCase().trim(),
                minCards: parseInt(values[3], 10) || 1, // デフォルト1（1枚から判定可能に）
                mult1: parseFloat(values[4]) !== undefined && !isNaN(parseFloat(values[4])) ? parseFloat(values[4]) : 1.0,
                mult2: parseFloat(values[5]) !== undefined && !isNaN(parseFloat(values[5])) ? parseFloat(values[5]) : 1.0,
                mult3: parseFloat(values[6]) !== undefined && !isNaN(parseFloat(values[6])) ? parseFloat(values[6]) : 1.0
            };
        }
        
        console.log("読み込み完了したタグマスタ:", tagMaster); // ★デバッグ用ログ
        return tagMaster;
    } catch (error) {
        console.error('tags.csv 読み込みエラー:', error);
        return {};
    }
}

// cpu_decks.csv の読み込み
export async function loadCpuDecksCSV() {
    try {
        const response = await fetch(`cpu_decks.csv?v=${new Date().getTime()}`);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) return [];

        const cpuDecks = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const deckId = values[0];
            const deckName = values[1];
            const leaderId = values[2];
            const cardIds = values.slice(3).filter(Boolean);

            if (deckId) {
                cpuDecks.push({
                    deckId,
                    deckName,
                    leaderId,
                    cardIds
                });
            }
        }
        return cpuDecks;
    } catch (error) {
        console.error('cpu_decks.csv 読み込みエラー:', error);
        return [];
    }
}

// ★ 追加: joker_results.csv の読み込み関数
export async function loadJokerResultsCSV() {
    try {
        const response = await fetch(`joker_results.csv?v=${new Date().getTime()}`);
        if (!response.ok) return [];

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const jokerResults = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const item = {};

            headers.forEach((header, index) => {
                item[header] = values[index] || '';
            });

            if (item.joker_id || item.jokerId) {
                jokerResults.push(item);
            }
        }
        return jokerResults;
    } catch (error) {
        console.error('joker_results.csv 読み込みエラー:', error);
        return [];
    }
}

// bgm.csv の読み込み
export async function loadBgmCSV() {
    try {
        const response = await fetch(`bgm.csv?v=${new Date().getTime()}`);
        if (!response.ok) return [];

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const bgmMaster = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const item = {};
            headers.forEach((header, index) => {
                item[header] = values[index] || '';
            });

            if (item.bgm_id || item.bgmId) {
                bgmMaster.push(item);
            }
        }
        return bgmMaster;
    } catch (error) {
        console.error('bgm.csv 読み込みエラー:', error);
        return [];
    }
}

// ゲーム全体のデータ読み込み統括（bgmMaster を追加）
export async function loadGameDataFromCSV() {
    const [cardsDb, tagMaster, cpuDecks, jokerResults, bgmMaster] = await Promise.all([
        loadCardsCSV(),
        loadTagsCSV(),
        loadCpuDecksCSV(),
        loadJokerResultsCSV(),
        loadBgmCSV() // ★ 追加
    ]);

    return {
        cardsDb,
        tagMaster,
        cpuDecks,
        jokerResults,
        bgmMaster // ★ 追加
    };
}