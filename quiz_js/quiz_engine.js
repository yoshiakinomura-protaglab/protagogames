/**
 * js/quiz/quiz_engine.js - 典学モード 出題進行 ＆ 3形式判定エンジン（記述柔軟採点対応版）
 */

let quizMasterData = [];

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

function getActiveLevelsForEra(eraId) {
    return quizMasterData
        .filter(r => r.era_id === eraId && r.is_active === "1")
        .sort((a, b) => (parseInt(a.level_order, 10) || 0) - (parseInt(b.level_order, 10) || 0));
}

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

// ★ 記述式（技術問題）の二段階柔軟採点エンジン
function judgeDescAnswer(userInput, questionItem) {
    const normUser = normalizeAnswerString(userInput);
    if (!normUser) return { isCorrect: false, feedback: "回答が空です。" };

    // 1. 同義語辞書の展開（choice3: "安寧=安定/平和,建立=造営" など）
    const synonymMap = new Map();
    if (questionItem.choice3) {
        questionItem.choice3.split(',').forEach(pair => {
            const parts = pair.split('=');
            if (parts.length === 2) {
                const base = normalizeAnswerString(parts[0]);
                const alts = parts[1].split('/').map(normalizeAnswerString);
                synonymMap.set(base, alts);
            }
        });
    }

    // 単語照合ヘルパー（同義語も合致とみなす）
    const containsTerm = (targetTerm) => {
        const normTarget = normalizeAnswerString(targetTerm);
        if (normUser.includes(normTarget)) return true;
        const alts = synonymMap.get(normTarget);
        if (alts && alts.some(alt => normUser.includes(alt))) return true;
        return false;
    };

    // 【STEP 1: 必須用語チェック】（choice1）
    const mustTerms = (questionItem.choice1 || '')
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    const missingTerms = mustTerms.filter(term => !containsTerm(term));
    if (missingTerms.length > 0) {
        return {
            isCorrect: false,
            feedback: `必須用語【${missingTerms.join('、')}】が不足しています。`
        };
    }

    // 【STEP 2: 内容・論点要件チェック】（choice2）
    // カンマ区切りの要点フレーズから重要単語を抽出し、意味のカバー率を判定
    const contentReqs = (questionItem.choice2 || '')
        .split(',')
        .map(r => r.trim())
        .filter(r => r.length > 0);

    if (contentReqs.length === 0) {
        return { isCorrect: true, feedback: "要点を的確に捉えています。" };
    }

    let matchCount = 0;
    contentReqs.forEach(req => {
        // フレーズ内のキーワードが含まれているか判定
        if (containsTerm(req)) {
            matchCount++;
        } else {
            // フレーズを形態素風に2文字以上の単語で分解して部分一致をチェック
            const words = req.split(/[のはがでにをと、。]+/).filter(w => w.length >= 2);
            if (words.some(w => containsTerm(w))) {
                matchCount += 0.8;
            }
        }
    });

    const coverRate = matchCount / contentReqs.length;
    // 要件の40%以上をカバーしていれば正解（表現の揺らぎを許容）
    if (coverRate >= 0.4) {
        return { isCorrect: true, feedback: "内容の趣旨が合致しています。" };
    } else {
        return {
            isCorrect: false,
            feedback: "必須用語は含まれていますが、論述内容の要点が不足しています。"
        };
    }
}

// 判定ディスパッチャー
function judgeUserAnswer(userInput, questionItem) {
    const qType = questionItem.q_type || 'choice';

    if (qType === 'choice') {
        return { isCorrect: userInput === true, feedback: '' };
    } else if (qType === 'input') {
        const normUser = normalizeAnswerString(userInput);
        const validAnswers = (questionItem.answer || questionItem.choice1 || '')
            .split(',')
            .map(a => normalizeAnswerString(a));
        const ok = validAnswers.includes(normUser);
        return { isCorrect: ok, feedback: ok ? '' : '表記または用語が異なります。' };
    } else if (qType === 'desc') {
        return judgeDescAnswer(userInput, questionItem);
    }
    return { isCorrect: false, feedback: '' };
}