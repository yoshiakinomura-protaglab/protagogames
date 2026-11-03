/**
 * js/quiz/quiz_engine.js - 典学モード 出題進行 ＆ マスターCSV駆動判定エンジン
 */

let quizMasterData = []; // quiz_master.csv のキャッシュ

let cachedQuizData = {
    csvPath: '',
    allLevelQuestions: []
};

let currentQuizSession = {
    questions: [],
    currentIndex: 0,
    score: 0,
    timer: null,
    timeRemaining: 15.0,
    perQuestionTime: 15.0,
    isLocked: false
};

// CSVパース共通
function parseQuizCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.match(/(?:[^\s",]+|"[^"]*")+/g) || line.split(',');
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = cols[idx] ? cols[idx].replace(/^"|"$/g, '').trim() : '';
        });
        result.push(row);
    }
    return result;
}

// 1. マスターCSVのロード
async function loadQuizMasterCSV() {
    if (quizMasterData.length > 0) return quizMasterData;
    try {
        const res = await fetch('quiz/quiz_master.csv');
        if (!res.ok) throw new Error("quiz_master.csv が取得できません");
        const text = await res.text();
        quizMasterData = parseQuizCSV(text);
        return quizMasterData;
    } catch (e) {
        console.error("[Quiz] マスターCSVロード失敗:", e);
        return [];
    }
}

// 公開対象（is_active === "1"）の時代一覧を取得
function getActiveErasFromMaster() {
    const activeRows = quizMasterData.filter(r => r.is_active === "1");
    const eraMap = new Map();
    activeRows.forEach(r => {
        if (!eraMap.has(r.era_id)) {
            eraMap.set(r.era_id, {
                id: r.era_id,
                name: r.era_name,
                order: parseInt(r.era_order, 10) || 99,
                banner: r.era_banner || `images/quiz_${r.era_id}_banner.jpg`
            });
        }
    });
    return Array.from(eraMap.values()).sort((a, b) => a.order - b.order);
}

// 特定の時代の公開等級一覧を取得
function getActiveLevelsForEra(eraId) {
    return quizMasterData
        .filter(r => r.era_id === eraId && r.is_active === "1")
        .sort((a, b) => (parseInt(a.level_order, 10) || 0) - (parseInt(b.level_order, 10) || 0));
}

// 2. 指定された問題CSVのロード（キャッシュ管理）
async function loadTargetQuizCSV(csvPath) {
    if (cachedQuizData.csvPath === csvPath && cachedQuizData.allLevelQuestions.length > 0) {
        return cachedQuizData.allLevelQuestions;
    }

    try {
        const res = await fetch(csvPath);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const text = await res.text();
        const data = parseQuizCSV(text);
        cachedQuizData = {
            csvPath: csvPath,
            allLevelQuestions: data
        };
        return data;
    } catch (e) {
        console.error(`[Quiz] ${csvPath} の取得失敗:`, e);
        cachedQuizData = { csvPath: csvPath, allLevelQuestions: [] };
        return [];
    }
}

// CSVからステージ構成（試練番号・形式）を動的解析して取得
function getLevelStageInfo() {
    const questions = cachedQuizData.allLevelQuestions || [];
    const packageIds = [...new Set(questions.map(q => parseInt(q.package_id, 10)).filter(n => !isNaN(n)))].sort((a, b) => a - b);
    
    if (packageIds.length === 0) return [];

    return packageIds.map(pkgId => {
        const firstQ = questions.find(q => parseInt(q.package_id, 10) === pkgId);
        return {
            stageNum: pkgId,
            type: firstQ?.q_type || 'choice'
        };
    });
}

function getFixedPackageQuestions(pkgId) {
    return cachedQuizData.allLevelQuestions.filter(q => parseInt(q.package_id, 10) === parseInt(pkgId, 10))
                                          .sort((a, b) => parseInt(a.q_no, 10) - parseInt(b.q_no, 10));
}

function getRandomExamQuestions() {
    const pool = [...cachedQuizData.allLevelQuestions];
    for (let i = pool.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[r]] = [pool[r], pool[i]];
    }
    return pool.slice(0, 10);
}

// 文字ゆらぎ正規化
function normalizeAnswerString(str) {
    if (!str) return '';
    let s = str.trim().toLowerCase();
    s = s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    s = s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
    s = s.replace(/\s+/g, '');
    return s;
}

function getShuffledChoices(q) {
    const choices = [
        { text: q.choice1, isCorrect: true },
        { text: q.choice2, isCorrect: false },
        { text: q.choice3, isCorrect: false },
        { text: q.choice4, isCorrect: false }
    ];
    for (let i = choices.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[r]] = [choices[r], choices[i]];
    }
    return choices;
}

// 回答判定コア（四択・一問一答・記述共通）
function judgeUserAnswer(userInput, questionItem) {
    const qType = questionItem.q_type || 'choice';

    if (qType === 'choice') {
        return userInput === true;
    } else if (qType === 'input') {
        const normUser = normalizeAnswerString(userInput);
        const validAnswers = (questionItem.answer || questionItem.choice1 || '')
            .split(',')
            .map(a => normalizeAnswerString(a));
        return validAnswers.includes(normUser);
    } else if (qType === 'desc') {
        const normUser = normalizeAnswerString(userInput);
        let rawKeywords = [];
        if (questionItem.keywords) {
            rawKeywords = questionItem.keywords.split(',');
        } else {
            [questionItem.choice1, questionItem.choice2, questionItem.choice3, questionItem.choice4, questionItem.answer].forEach(val => {
                if (val && val.trim()) rawKeywords.push(val);
            });
        }

        const keywords = rawKeywords
            .map(k => normalizeAnswerString(k))
            .filter(k => k.length > 0);

        if (keywords.length === 0) return true;
        const matchCount = keywords.filter(kw => normUser.includes(kw)).length;
        const requiredCount = Math.max(1, Math.floor(keywords.length * 0.4));
        return matchCount >= requiredCount;
    }
    return false;
}