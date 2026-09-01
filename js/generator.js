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

  /* 各级别読解会出现的题型（官方试题构成），随机一题模式从中抽取 */
  const RANDOM_TYPES = {
    N5: ['短文', '情報検索'],
    N4: ['短文', '中文', '情報検索'],
    N3: ['短文', '中文', '長文', '情報検索'],
    N2: ['短文', '中文', '統合理解', '主張理解', '情報検索'],
    N1: ['短文', '中文', '長文', '統合理解', '主張理解', '情報検索']
  };

  /* 各题型对应的小问数范围 [最小, 最大]（随机一题模式在该范围内抽取） */
  const GENRE_QCOUNT = {
    '短文': [1, 1],
    '中文': [2, 3],
    '長文': [3, 4],
    '統合理解': [2, 2],
    '主張理解': [3, 4],
    '情報検索': [1, 2]
  };

  const GENRE_FULL = {
    '短文': '内容理解・短文', '中文': '内容理解・中文', '長文': '内容理解・長文',
    '統合理解': '総合理解', '主張理解': '主張理解', '情報検索': '情報検索'
  };

  const LENGTH_HINT = {
    '短文': '150〜250字程度の非常に短い文章',
    '中文': '400〜600字程度の中程度の長さの文章',
    '長文': '900〜1200字程度の長い文章',
    '統合理解': '同じテーマに関する主張の異なる2篇の文章（各250〜350字程度、合計600字程度）。2篇は比較できる観点の違い・意見の一致点や相違点を持つこと',
    '主張理解': '900〜1200字程度の抽象的・論理的な評論・社説',
    '情報検索': '募集要項・お知らせ・チラシ・表・リストなど、実生活の情報源となる600〜800字程度のテキスト（項目立てや箇条書きを用いる）'
  };

  /* 题型对应的设问风格提示 */
  const QUESTION_HINT = {
    '短文': '例:「この文章の内容と合っているものはどれか」「〜とあるが、なぜか」',
    '中文': '例:「〜について最もよく表しているのはどれか」「〜とあるが、その理由は何か」',
    '長文': '例:「この文章で筆者が最も言いたいことはどれか」「〜とあるが、どういう意味か」',
    '統合理解': '例:「AとBの両方に当てはまるのはどれか」「AとBの主張の関係を最も正しく説明しているのはどれか」など、2篇の内容の一致点・相違点を比較させる設問にすること',
    '主張理解': '例:「この文章の内容と合っているものはどれか」「筆者の主張はどれか」など、文章全体の論点・主張を問う設問にすること',
    '情報検索': '例:「〜できるのはどれか」「〜の条件をすべて満たすのはどれか」'
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
    const isCompare = genre === '統合理解';
    return `あなたはJLPT日本語能力試験の読解問題作成の専門家です。次の条件に従い、${level}レベルの読解問題を1つ作成してください。

【文章】
- 分野: ${gFull}
- 長さ: ${LENGTH_HINT[genre]}
- 難易度: ${LEVEL_DESC[level]}
- 自然で実用的な日本語で書くこと。レベルに見合った語彙・文法を使用すること。${genre === '情報検索' ? '情報検索は実際の試験同様、項目・条件・注意書きを列挙した実用的なテキストにすること。' : '話題はJLPT読解の典型（生活・学校・仕事・社会・文化・科学など）から選ぶこと。'}${isCompare ? '\n- 2篇は筆者の立場・主張が異なる文章にし、各文章の冒頭に「【文章A】」「【文章B】」の見出しを付け、本文中では自分自身の文章を参照しないこと。' : ''}

【設問】
- ちょうど${qCount}問。 各問4択（選択肢は必ず4つ）。
- 実際のJLPTの設問スタイルに合わせること。${QUESTION_HINT[genre]}
- 各問のanswer（正解のインデックス0-3）は分散させ、偏らないようにすること。
- 各問には必ず次のフィールドを含めること:
  - evidence: 正解の根拠となる本文中の一文を、本文から一字一句変更せずそのまま引用する（引用符を付けず、改行を含めない）。
  - explanation: 問題全体の解説（日本語）。
  - optionExplanations: 4つの選択肢それぞれについての解説を配列で書く。正解にはなぜ正しいかを、誤りの選択肢には本文のどこに矛盾・不一致するかを日本語で簡潔に書くこと。
  - optionEvidence: 4つの選択肢それぞれの判断材料となる本文中の語句・文をそのまま引用した配列。根拠を指摘できない選択肢は ""（空文字）にすること。

【出力形式】
以下のJSON形式のみを出力すること。マークダウンのコードブロックや説明文は一切書かないこと。
{
  "genre": "${gFull}",
  "title": "文章のタイトル",
  ${isCompare ? '"texts": ["【文章A】を含むAの本文全体", "【文章B】を含むBの本文全体"],' : '"text": "本文（改行は\\nで表現）",'}
  "questions": [
    { "prompt": "設問", "options": ["選1", "選2", "選3", "選4"], "answer": 0,
      "evidence": "本文からの根拠の一文（そのまま引用）",
      "explanation": "問題全体の解説",
      "optionExplanations": ["選1の解説", "選2の解説", "選3の解説", "選4の解説"],
      "optionEvidence": ["選1の根拠", "選2の根拠", "選3の根拠", "選4の根拠"] }
  ]
}`;
  }

  /* 校验单篇结构（統合理解的文章存于 texts 数组，其余为 text） */
  function validatePassage(p, qCount, genre) {
    if (!p || typeof p !== 'object') return '非对象';
    if (genre === '統合理解') {
      if (!Array.isArray(p.texts) || p.texts.length !== 2 ||
        p.texts.some(t => typeof t !== 'string' || t.trim().length < 40)) return '総合理解は2篇の文章が必要';
    } else if (!p.title || !p.text || p.text.length < 40) return '文章缺失或过短';
    if (!p.title) return '缺少标题';
    if (!Array.isArray(p.questions) || p.questions.length !== qCount) return `题目数应为${qCount}`;
    for (const q of p.questions) {
      if (!q.prompt || !Array.isArray(q.options) || q.options.length !== 4) return '选项应为4个';
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return 'answer 越界';
      if (typeof q.explanation !== 'string' || !q.explanation.trim()) return '缺少解析';
      if (typeof q.evidence !== 'string' || !q.evidence.trim()) return '缺少原文依据 evidence';
      if (!Array.isArray(q.optionExplanations) || q.optionExplanations.length !== 4 ||
        q.optionExplanations.some(s => !String(s || '').trim())) return '选项解析应为4条';
    }
    return null;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 生成一套试题（逐篇请求，回调进度与 token 用量）。
   * @param {object} settings
   * @param {{mode:'full'|'random', level:string}} config
   * @param {{onProgress?:(done:number,total:number,label:string)=>void, onTokens?:(total:number)=>void, signal?:AbortSignal}} hooks
   * @returns {Promise<object>} exam 对象
   */
  async function generateExam(settings, config, hooks = {}) {
    const plan = [];
    if (config.mode === 'full') {
      for (const item of FULL_SET[config.level]) plan.push({ genre: item.g, q: item.q });
    } else {
      // 随机一题：从该级别题型池中随机抽取 1 种，小问数按题型在范围内随机
      const pool = RANDOM_TYPES[config.level];
      const genre = pool[Math.floor(Math.random() * pool.length)];
      const [minQ, maxQ] = GENRE_QCOUNT[genre];
      const q = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
      plan.push({ genre, q });
    }
    const totalQ = plan.reduce((s, p) => s + p.q, 0);
    const totalP = plan.length;

    let tokens = 0;
    const onUsage = u => {
      const t = Number(u && u.total_tokens != null
        ? u.total_tokens
        : ((u && u.prompt_tokens) || 0) + ((u && u.completion_tokens) || 0));
      if (!Number.isFinite(t) || t <= 0) return;
      tokens += t;
      if (hooks.onTokens) hooks.onTokens(tokens);
    };

    const passages = [];
    let doneQ = 0;
    for (let i = 0; i < plan.length; i++) {
      const { genre, q } = plan[i];
      if (hooks.onProgress) {
        hooks.onProgress(doneQ, totalQ, `正在生成第 ${i + 1}/${totalP} 篇（${GENRE_FULL[genre]}・${q}問）`);
      }
      const p = await generatePassage(settings, config.level, genre, q, hooks.signal, onUsage);
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
      title: config.mode === 'full'
        ? `${config.level} 読解・整套模拟`
        : `${config.level} ${GENRE_FULL[plan[0].genre]}・随机 ${totalQ} 問`,
      passages,
      totalQuestions: totalQ,
      tokens
    };
    return exam;
  }

  async function generatePassage(settings, level, genre, qCount, signal, onUsage) {
    const maxTries = 3;
    let lastErr;
    for (let t = 0; t < maxTries; t++) {
      try {
        const p = await Api.chatJSON(settings, [
          { role: 'system', content: 'You are a meticulous JLPT exam content generator. Output JSON only.' },
          { role: 'user', content: passagePrompt(level, genre, qCount) }
        ], { temperature: settings.temperature, signal, onUsage, jsonMode: settings.jsonMode && t === 0 ? undefined : false });
        const err = validatePassage(p, qCount, genre);
        if (err) throw new Error('格式校验未通过：' + err);
        // 规范化（総合理解：两篇拼接为单文本展示）
        if (genre === '統合理解' && !p.text) {
          p.text = p.texts.join('\n\n────────\n\n');
        }
        p.questions = p.questions.map(q => ({
          prompt: String(q.prompt),
          options: q.options.map(o => String(o)),
          answer: q.answer,
          explanation: String(q.explanation),
          evidence: typeof q.evidence === 'string' ? q.evidence : '',
          optionExplanations: Array.isArray(q.optionExplanations) ? q.optionExplanations.map(s => String(s || '')) : null,
          optionEvidence: Array.isArray(q.optionEvidence) ? q.optionEvidence.map(s => typeof s === 'string' ? s : '') : null
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

  window.Generator = { generateExam, gradeExam, FULL_SET, RANDOM_TYPES, GENRE_QCOUNT, GENRE_FULL };
})();
