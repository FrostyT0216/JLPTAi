/* ══════════ generator.js — JLPT 読解试题生成器（逐篇生成 + 校验重试） ══════════ */
(function () {
  'use strict';

  /* 每级别整套模拟的篇目配置（对应要求文档表 4-1） */
  const FULL_SET = {
    N5: [{ g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '中文', n: 1, q: 2 }],
    N4: [{ g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '中文', n: 1, q: 2 }, { g: '中文', n: 1, q: 2 }, { g: '情報検索', n: 1, q: 1 }],
    N3: [{ g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '中文', n: 1, q: 2 }, { g: '中文', n: 1, q: 2 }, { g: '長文', n: 1, q: 3 }, { g: '情報検索', n: 1, q: 2 }],
    N2: [{ g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '中文', n: 1, q: 3 }, { g: '中文', n: 1, q: 3 }, { g: '長文', n: 1, q: 3 }, { g: '情報検索', n: 1, q: 2 }],
    N1: [{ g: '短文', n: 1, q: 1 }, { g: '短文', n: 1, q: 1 }, { g: '中文', n: 1, q: 3 }, { g: '中文', n: 1, q: 3 }, { g: '長文', n: 1, q: 3 }, { g: '長文', n: 1, q: 3 }, { g: '情報検索', n: 1, q: 2 }]
  };
  /* 专项练习：总题数 → 各篇拆分（每篇最多 3 問） */
  const DRILL_PLAN = {
    5: [1, 1, 1, 2],
    10: [2, 2, 3, 3],
    15: [2, 2, 2, 3, 3, 3]
  };

  const GENRE_FULL = { '短文': '内容理解・短文', '中文': '内容理解・中文', '長文': '内容理解・長文', '情報検索': '情報検索' };

  const LENGTH_HINT = {
    '短文': '150〜250字程度の非常に短い文章',
    '中文': '400〜600字程度の中程度の長さの文章',
    '長文': '900〜1200字程度の長い文章',
    '情報検索': '募集要項・お知らせ・チラシ・表・リストなど、実生活の情報源となる600〜800字程度のテキスト（項目立てや箇条書きを用いる）'
  };

  const LEVEL_DESC = {
    N5: 'JLPT N5（入門）：基本的な漢字・ひらがな中心の易しい文章',
    N4: 'JLPT N4（初級）：日常的な話題の平易な文章、基本的な漢字使用',
    N3: 'JLPT N3（中級）：日常的・やや抽象的な話題、常用漢字中心',
    N2: 'JLPT N2（上級）：新聞記事・評論・説明文など幅広い話題の文章',
    N1: 'JLPT N1（最上級）：抽象的・論理的な評論・社説・専門的な文章'
  };

  function passagePrompt(level, genre, qCount) {
    const gFull = GENRE_FULL[genre];
    return `あなたはJLPT日本語能力試験の読解問題作成の専門家です。次の条件に従い、${level}レベルの読解問題を1つ作成してください。

【文章】
- 分野: ${gFull}
- 長さ: ${LENGTH_HINT[genre]}
- 難易度: ${LEVEL_DESC[level]}
- 自然で実用的な日本語で書くこと。レベルに見合った語彙・文法を使用すること。${genre === '情報検索' ? '情報検索は実際の試験同様、項目・条件・注意書きを列挙した実用的なテキストにすること。' : '話題はJLPT読解の典型（生活・学校・仕事・社会・文化・科学など）から選ぶこと。'}

【設問】
- ちょうど${qCount}問。 各問4択（選択肢は必ず4つ）。
- 実際のJLPTの設問スタイルに合わせること（例:「〜について最もよく表しているのはどれか」「〜とあるが、なぜか」「この文章の内容と合っているものはどれか」; 情報検索は「〜できるのはどれか」「〜の条件をすべて満たすのはどれか」等）。
- 各問のanswer（正解のインデックス0-3）は分散させ、偏らないようにすること。
- explanationには、根拠となる本文中の部分と各選択肢の判断理由を日本語で簡潔に書くこと。

【出力形式】
以下のJSON形式のみを出力すること。マークダウンのコードブロックや説明文は一切書かないこと。
{
  "genre": "${gFull}",
  "title": "文章のタイトル",
  "text": "本文（改行は\\nで表現）",
  "questions": [
    { "prompt": "設問", "options": ["選1", "選2", "選3", "選4"], "answer": 0, "explanation": "解説" }
  ]
}`;
  }

  /* 校验单篇结构 */
  function validatePassage(p, qCount) {
    if (!p || typeof p !== 'object') return '非对象';
    if (!p.title || !p.text || p.text.length < 40) return '文章缺失或过短';
    if (!Array.isArray(p.questions) || p.questions.length !== qCount) return `题目数应为${qCount}`;
    for (const q of p.questions) {
      if (!q.prompt || !Array.isArray(q.options) || q.options.length !== 4) return '选项应为4个';
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return 'answer 越界';
      if (typeof q.explanation !== 'string' || !q.explanation.trim()) return '缺少解析';
    }
    return null;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 生成一套试题（逐篇请求，回调进度）。
   * @param {object} settings
   * @param {{mode:'full'|'drill', level:string, genre?:string, count?:number}} config
   * @param {{onProgress?:(done:number,total:number,label:string)=>void, signal?:AbortSignal}} hooks
   * @returns {Promise<object>} exam 对象
   */
  async function generateExam(settings, config, hooks = {}) {
    const plan = [];
    if (config.mode === 'full') {
      for (const item of FULL_SET[config.level]) plan.push({ genre: item.g, q: item.q });
    } else {
      const counts = DRILL_PLAN[config.count] || DRILL_PLAN[5];
      for (const q of counts) plan.push({ genre: config.genre, q });
    }
    const totalQ = plan.reduce((s, p) => s + p.q, 0);
    const totalP = plan.length;

    const passages = [];
    let doneQ = 0;
    for (let i = 0; i < plan.length; i++) {
      const { genre, q } = plan[i];
      if (hooks.onProgress) {
        hooks.onProgress(doneQ, totalQ, `正在生成第 ${i + 1}/${totalP} 篇（${GENRE_FULL[genre]}・${q}問）`);
      }
      const p = await generatePassage(settings, config.level, genre, q, hooks.signal);
      p.genreTag = genre;
      p.id = i + 1;
      passages.push(p);
      doneQ += q;
    }

    const exam = {
      id: uid(),
      ts: Date.now(),
      mode: config.mode,
      level: config.level,
      genre: config.mode === 'drill' ? config.genre : null,
      title: config.mode === 'full'
        ? `${config.level} 読解・整套模拟`
        : `${config.level} ${GENRE_FULL[config.genre]}・专项 ${totalQ}問`,
      passages,
      totalQuestions: totalQ
    };
    return exam;
  }

  async function generatePassage(settings, level, genre, qCount, signal) {
    const maxTries = 3;
    let lastErr;
    for (let t = 0; t < maxTries; t++) {
      try {
        const p = await Api.chatJSON(settings, [
          { role: 'system', content: 'You are a meticulous JLPT exam content generator. Output JSON only.' },
          { role: 'user', content: passagePrompt(level, genre, qCount) }
        ], { temperature: settings.temperature, signal, jsonMode: settings.jsonMode && t === 0 ? undefined : false });
        const err = validatePassage(p, qCount);
        if (err) throw new Error('格式校验未通过：' + err);
        // 规范化
        p.questions = p.questions.map(q => ({
          prompt: String(q.prompt),
          options: q.options.map(o => String(o)),
          answer: q.answer,
          explanation: String(q.explanation)
        }));
        return p;
      } catch (e) {
        if (e.name === 'AbortError' || /已取消/.test(e.message)) throw e;
        lastErr = e;
        if (/API 错误 401|API 错误 403|网络请求失败/.test(e.message)) throw e;
        await new Promise(r => setTimeout(r, 600));
      }
    }
    throw new Error(`生成失败：${lastErr && lastErr.message}`);
  }

  /** 计分 */
  function gradeExam(exam, answers) {
    let correct = 0;
    const detail = [];
    for (const p of exam.passages) {
      let pCorrect = 0;
      for (let qi = 0; qi < p.questions.length; qi++) {
        const q = p.questions[qi];
        const user = answers[p.id] != null ? answers[p.id][qi] : null;
        const ok = user === q.answer;
        if (ok) { correct++; pCorrect++; }
        detail.push({ passageId: p.id, qIndex: qi, user, answer: q.answer, ok });
      }
      p._score = pCorrect;
    }
    return { correct, total: exam.totalQuestions, detail };
  }

  window.Generator = { generateExam, gradeExam, FULL_SET, GENRE_FULL };
})();
