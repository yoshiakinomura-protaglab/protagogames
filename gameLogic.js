/**
 * csvLoader.js - CSVデータ読み込みモジュール
 */
export async function loadGameDataFromCSV() {
    try {
        const [cardsRes, tagsRes] = await Promise.all([
            fetch('cards.csv'),
            fetch('tags.csv')
        ]);

        if (!cardsRes.ok || !tagsRes.ok) return null;

        const cardsText = await cardsRes.text();
        const tagsText = await tagsRes.text();

        // 1. tags.csv 解析
        const tagCategories = {};
        const tagRanks = {};
        tagsText.split(/\r?\n/).forEach((line, idx) => {
            if (idx === 0 || !line.trim()) return;
            const cols = parseCsvLine(line);
            if (cols.length >= 3) {
                tagCategories[cols[0].trim()] = cols[1].trim();
                tagRanks[cols[0].trim()] = cols[2].trim();
            }
        });

        // 2. cards.csv 解析
        const cardsDb = [];
        cardsText.split(/\r?\n/).forEach((line, idx) => {
            if (idx === 0 || !line.trim()) return;
            const cols = parseCsvLine(line);

            if (cols.length >= 2) {
                const id = cols[0] ? cols[0].trim() : '';
                const name = cols[1] ? cols[1].trim() : '';
                if (!id || !name) return;

                const rank = cols[2] ? cols[2].trim() : 'A';
                const num = cols[3] ? (parseInt(cols[3].trim(), 10) || 14) : 14;
                const janken = cols[4] ? cols[4].trim() : 'gu';
                const power = cols[5] ? (parseInt(cols[5].trim(), 10) || 500) : 500;
                
                const rawTagsStr = cols[6] ? cols[6].trim() : '';
                const cleanTagsStr = rawTagsStr.replace(/^["']|["']$/g, '').trim();
                const tags = cleanTagsStr ? cleanTagsStr.split(/[;,]/).map(t => t.trim()) : [];

                const imageReal = (cols[7] && cols[7].trim()) ? cols[7].trim() : `${id}_real.jpg`;
                const imageIllust = (cols[8] && cols[8].trim()) ? cols[8].trim() : `${id}_illust.jpg`;

                cardsDb.push({ id, name, rank, num, janken, power, tags, imageReal, imageIllust });
            }
        });

        return { cardsDb, tagCategories, tagRanks };
    } catch (error) {
        console.error("CSVエラー:", error);
        return null;
    }
}

function parseCsvLine(text) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === "'") inQuote = !inQuote;
        else if (c === ',' && !inQuote) { result.push(cur); cur = ''; }
        else cur += c;
    }
    result.push(cur);
    return result;
}