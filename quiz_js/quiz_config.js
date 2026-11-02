/**
 * js/quiz/quiz_config.js - 典学モード 定義・マスターデータ
 */

// 3色木札アセット定義
const QUIZ_TAG_ASSETS = {
    choice: {
        type: 'choice',
        name: '四択',
        image: 'images/tag_choice.png',
        badgeColor: 'border-emerald-500/80 text-emerald-300 bg-emerald-950/80'
    },
    input: {
        type: 'input',
        name: '一問一答',
        image: 'images/tag_input.png',
        badgeColor: 'border-rose-500/80 text-rose-300 bg-rose-950/80'
    },
    desc: {
        type: 'desc',
        name: '記述',
        image: 'images/tag_desc.png',
        badgeColor: 'border-purple-500/80 text-purple-300 bg-purple-950/80'
    }
};

// 等級マスターデータ（奈良時代）
const NARA_LEVELS = [
    {
        id: 'basic',
        name: '初級',
        banner: 'images/quiz_nara_lv1_banner.jpg',
        rewardCard: '平城京',
        stages: 3,
        stageTypes: ['choice', 'input', 'choice'] // 1:四択, 2:直打ち, 3:四択
    },
    {
        id: 'normal',
        name: '中級',
        banner: 'images/quiz_nara_lv2_banner.jpg',
        rewardCard: '墾田永年私財法',
        stages: 4,
        stageTypes: ['choice', 'input', 'choice', 'input']
    },
    {
        id: 'hard',
        name: '上級',
        banner: 'images/quiz_nara_lv3_banner.jpg',
        rewardCard: '東大寺盧舎那仏',
        stages: 3,
        stageTypes: ['input', 'choice', 'desc']
    }
];

// 報酬・覚醒カードID対応表（通常ID ➔ 覚醒版ID）
const NARA_CARD_REWARDS = {
    basic:  { name: '平城京',         normalId: 'c20001', awakenedId: 'c20001_awk' },
    normal: { name: '墾田永年私財法',   normalId: 'c20002', awakenedId: 'c20002_awk' },
    hard:   { name: '東大寺盧舎那仏', normalId: 'c20003', awakenedId: 'c20003_awk' }
};

// 時代区分マスター
const QUIZ_ERAS = [
    { id: 'paleo_jomon',   name: '旧石器・縄文', banner: null },
    { id: 'yayoi',          name: '弥生',        banner: null },
    { id: 'kofun_asuka',    name: '古墳・飛鳥',  banner: null },
    { id: 'nara',           name: '奈良',        banner: 'images/quiz_nara_banner.jpg' },
    { id: 'heian',          name: '平安',        banner: null },
    { id: 'kamakura',       name: '鎌倉',        banner: null },
    { id: 'muromachi',      name: '南北朝・室町', banner: null },
    { id: 'sengoku',        name: '戦国・安土桃山', banner: null },
    { id: 'edo',            name: '江戸',        banner: null },
    { id: 'bakumatsu',      name: '幕末',        banner: null },
    { id: 'meiji',          name: '明治',        banner: null },
    { id: 'taisho_prewar',  name: '大正・戦前',  banner: null },
    { id: 'postwar',        name: '戦後・現代',  banner: null }
];

const NUMBER_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];