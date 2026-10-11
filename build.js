const fs = require('fs');
const path = require('path');

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = [];
        let insideQuote = false;
        let currentValue = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim());

        const row = {};
        headers.forEach((header, index) => {
            let val = values[index] || '';
            val = val.replace(/^"|"$/g, '');
            row[header] = val;
        });
        result.push(row);
    }
    return result;
}

try {
    const cardsText = fs.readFileSync(path.join(__dirname, 'cards.csv'), 'utf8');
    const tagsText = fs.readFileSync(path.join(__dirname, 'tags.csv'), 'utf8');

    const rawCards = parseCSV(cardsText);
    const rawTags = parseCSV(tagsText);

    const cardsDb = rawCards.map(c => ({
        id: c.id,
        name: c.name,
        rank: c.rank,
        num: parseInt(c.num, 10),
        janken: c.janken,
        power: parseInt(c.power, 10),
        tags: c.tags ? c.tags.split(',').map(t => t.trim()) : [],
        image: c.image || ''
    }));

    const tagCategories = {};
    const tagRanks = {};

    rawTags.forEach(t => {
        tagCategories[t.tag] = t.category;
        tagRanks[t.tag] = t.rank;
    });

    const outputContent = `// 自動生成されたゲームデータです
window.GAME_CARDS_DATA = ${JSON.stringify(cardsDb, null, 2)};
window.GAME_TAG_CATEGORIES = ${JSON.stringify(tagCategories, null, 2)};
window.GAME_TAG_RANKS = ${JSON.stringify(tagRanks, null, 2)};
`;

    fs.writeFileSync(path.join(__dirname, 'data.js'), outputContent, 'utf8');
    console.log('✅ 配布用データ (data.js) の生成が完了しました！');
} catch (err) {
    console.error('❌ ビルド中にエラーが発生しました:', err);
}