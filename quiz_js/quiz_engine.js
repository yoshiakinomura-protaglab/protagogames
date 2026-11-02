/**
 * js/quiz/quiz_engine.js - 典学モード 出題進行 ＆ 3形式判定エンジン
 */

let cachedQuizData = {
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

// 等級内CSVの全ロード
async function loadLevelQuizData(era = 'nara', level = 'basic') {
    const fileName = `quiz/quiz_${era}_${level}.csv`;
    try {
        const res = await fetch(fileName);
        const text = await res.text();
        const data = parseQuizCSV(text);
        cachedQuizData.allLevelQuestions = data;
        return data;
    } catch (e) {
        console.error(`[Quiz] ${fileName} のロードに失敗:`, e);
        return [];
    }
}

// 固定試練（パッケージ）の抽出
function getFixedPackageQuestions(pkgId) {
    return cachedQuizData.allLevelQuestions.filter(q => parseInt(q.package_id, 10) === parseInt(pkgId, 10))
                                          .sort((a, b) => parseInt(a.q_no, 10) - parseInt(b.q_no, 10));
}

// 昇段ランダム検定（全問から3形式混在で10問抽出）
function getRandomExamQuestions() {
    const pool = [...cachedQuizData.allLevelQuestions];
    for (let i = pool.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[r]] = [pool[r], pool[i]];
    }
    return pool.slice(0, 10);
}

// 文字列ゆらぎ正規化（全角半角・カタカナひらがな・空白除去）
function normalizeAnswerString(str) {
    if (!str) return '';
    let s = str.trim().toLowerCase();
    // 全角英数を半角へ
    s = s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // カタカナをひらがなへ変換
    s = s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
    // 空白の完全除去
    s = s.replace(/\s+/g, '');
    return s;
}

// 四択シャッフル
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
        // answer列にカンマ区切りで複数別解がある場合にも対応
        const validAnswers = (questionItem.answer || questionItem.choice1 || '')
            .split(',')
            .map(a => normalizeAnswerString(a));
        return validAnswers.includes(normUser);
    } else if (qType === 'desc') {
        const normUser = normalizeAnswerString(userInput);
        // 必須キーワード（choice2などに格納、またはanswerそのまま）の部分一致チェック
        const keywords = (questionItem.choice2 || questionItem.answer || '')
            .split(',')
            .map(k => normalizeAnswerString(k))
            .filter(k => k.length > 0);
        return keywords.every(kw => normUser.includes(kw));
    }
    return false;
}