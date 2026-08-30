/* ══════════ app.js — 界面路由与业务流程 ══════════ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const OPT_MARKS = ['①', '②', '③', '④'];

  /* ───── 全局状态 ───── */
  const state = {
    mode: 'full', level: 'N5', genre: '短文', count: 5,
    generating: false, abortCtrl: null,
    exam: null, answers: {},          // 进行中的考试
    result: null,                      // {exam, grade, record}
    heatYear: new Date().getFullYear()
  };

  /* ───── 通用 UI ───── */
  let toastTimer;
  function toast(msg, ms = 2200) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function showDialog(title, msg, buttons) {
    return new Promise(resolve => {
      $('dialog-title').textContent = title;
      $('dialog-msg').textContent = msg;
      const box = $('dialog-actions');
      box.innerHTML = '';
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        if (b.bold) btn.classList.add('bold');
        if (b.destructive) btn.classList.add('destructive');
        btn.onclick = () => {
          $('dialog-mask').classList.add('hidden');
          resolve(b.value);
        };
        box.appendChild(btn);
      });
      $('dialog-mask').classList.remove('hidden');
    });
  }

  /* ───── Tab 切换 ───── */
  const TAB_SCREENS = { home: 'screen-home', history: 'screen-history', settings: 'screen-settings' };
  function switchTab(tab) {
    Object.entries(TAB_SCREENS).forEach(([t, id]) => $(id).classList.toggle('hidden', t !== tab));
    document.querySelectorAll('.tab-item').forEach(el =>
      el.classList.toggle('active', el.dataset.tab === tab));
    if (tab === 'history') renderHistory();
    if (tab === 'home') renderHome();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab-item').forEach(el =>
    el.addEventListener('click', () => switchTab(el.dataset.tab)));

  /* ───── 主题（跟随系统 / 浅色 / 深色） ───── */
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const THEME_COLORS = { light: '#E9F1EC', dark: '#0A100E' };

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme; // auto：交给 prefers-color-scheme
    const resolved = (theme === 'dark' || (theme !== 'light' && mqDark.matches))
      ? THEME_COLORS.dark : THEME_COLORS.light;
    document.querySelectorAll('meta[name="theme-color"]')
      .forEach(m => m.setAttribute('content', resolved));
    updateThemeHint();
  }

  function updateThemeHint() {
    const hint = $('theme-hint');
    if (!hint) return;
    const t = Storage.getSettings().theme || 'auto';
    hint.textContent = t === 'auto'
      ? `跟随系统 · 当前为${mqDark.matches ? '深色' : '浅色'}模式`
      : t === 'light' ? '固定使用浅色主题' : '固定使用深色主题';
  }

  mqDark.addEventListener && mqDark.addEventListener('change', () => {
    if ((Storage.getSettings().theme || 'auto') === 'auto') applyTheme('auto');
  });

  $('seg-theme').addEventListener('click', e => {
    const btn = e.target.closest('.seg-item');
    if (!btn) return;
    $('seg-theme').querySelectorAll('.seg-item').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    Storage.saveSettings({ theme: btn.dataset.theme });
    applyTheme(btn.dataset.theme);
  });

  /* ═══════════ 首页 ═══════════ */
  function bindSegmented(id, attr, cb) {
    $(id).addEventListener('click', e => {
      const btn = e.target.closest('.seg-item');
      if (!btn || state.generating) return;
      $(id).querySelectorAll('.seg-item').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      cb(btn.dataset[attr]);
    });
  }

  bindSegmented('seg-level', 'level', v => { state.level = v; updateModeHint(); });
  bindSegmented('seg-mode', 'mode', v => {
    state.mode = v;
    $('drill-options').classList.toggle('hidden', v !== 'drill');
    updateModeHint();
  });
  bindSegmented('seg-genre', 'genre', v => { state.genre = v; });
  bindSegmented('seg-count', 'count', v => { state.count = +v; updateModeHint(); });

  function updateModeHint() {
    const hint = $('mode-hint');
    if (state.mode === 'full') {
      const total = Generator.FULL_SET[state.level].reduce((s, p) => s + p.q, 0);
      const ps = Generator.FULL_SET[state.level].length;
      hint.textContent = `${state.level} 整套模拟：${ps} 篇文章 / 共 ${total} 問（接近真实考试読解部分的题量，生成约需 1〜3 分钟）`;
    } else {
      const g = Generator.GENRE_FULL[state.genre];
      hint.textContent = `${state.level} ${g}：共 ${state.count} 問（生成约需 1〜2 分钟）`;
    }
  }

  function requireSettings() {
    const s = Storage.getSettings();
    if (!s.apiKey) {
      toast('请先在设置中填写 API Key');
      switchTab('settings');
      return false;
    }
    if (!s.model) {
      toast('请先在设置中填写模型名');
      switchTab('settings');
      return false;
    }
    return true;
  }

  async function startGeneration() {
    if (state.generating) return;
    if (!requireSettings()) return;

    state.exam = null; state.answers = {};
    state.generating = true;
    state.abortCtrl = new AbortController();

    $('btn-start').disabled = true;
    $('gen-status').classList.remove('hidden');
    setProgress(0, '正在连接 API…');

    const config = state.mode === 'full'
      ? { mode: 'full', level: state.level }
      : { mode: 'drill', level: state.level, genre: state.genre, count: state.count };

    try {
      const settings = Storage.getSettings();
      const exam = await Generator.generateExam(settings, config, {
        signal: state.abortCtrl.signal,
        onProgress: (done, total, label) => setProgress(done / total, label)
      });
      state.exam = exam;
      state.answers = {};
      state.generating = false;
      state.abortCtrl = null;
      $('gen-status').classList.add('hidden');
      $('btn-start').disabled = false;
      openExam(exam, {});
    } catch (e) {
      state.generating = false;
      state.abortCtrl = null;
      $('gen-status').classList.add('hidden');
      $('btn-start').disabled = false;
      if (!/已取消/.test(e.message)) {
        showDialog('生成失败', e.message, [{ label: '好' }]);
      } else {
        toast('已取消生成');
      }
    }
  }

  function setProgress(ratio, label) {
    $('gen-progress').style.width = `${Math.round(ratio * 100)}%`;
    if (label) $('gen-status-line').textContent = label;
  }

  $('btn-start').addEventListener('click', startGeneration);
  $('btn-gen-cancel').addEventListener('click', () => {
    if (state.abortCtrl) state.abortCtrl.abort();
  });

  /* ───── 草稿 ───── */
  function refreshDraftBanner() {
    const draft = Storage.getDraft();
    const banner = $('draft-banner');
    if (!draft || !draft.exam) { banner.classList.add('hidden'); return; }
    const answered = countAnswered(draft.answers, draft.exam);
    $('draft-banner-sub').textContent =
      `${draft.exam.title} · 已答 ${answered}/${draft.exam.totalQuestions} 問`;
    banner.classList.remove('hidden');
  }

  function countAnswered(answers, exam) {
    let n = 0;
    for (const p of exam.passages) {
      const a = answers[p.id] || {};
      n += p.questions.filter((_, qi) => a[qi] != null).length;
    }
    return n;
  }

  $('btn-draft-continue').addEventListener('click', () => {
    const draft = Storage.getDraft();
    if (!draft) return;
    state.exam = draft.exam;
    state.answers = draft.answers || {};
    openExam(state.exam, state.answers);
  });
  $('btn-draft-discard').addEventListener('click', async () => {
    const ok = await showDialog('放弃草稿', '未提交的作答将被丢弃，确定吗？', [
      { label: '取消', value: false }, { label: '放弃', value: true, destructive: true, bold: true }
    ]);
    if (ok) { Storage.clearDraft(); refreshDraftBanner(); }
  });

  /* ───── 最近成绩摘要 ───── */
  function renderHome() {
    refreshDraftBanner();
    updateModeHint();
    const records = Storage.getRecords();
    const card = $('last-result-card');
    if (records.length) {
      const r = records[0];
      const acc = r.total ? Math.round(r.correct / r.total * 100) : 0;
      $('last-result-body').innerHTML =
        `<div class="summary-score">${r.correct}<small> / ${r.total}</small></div>
         <div class="summary-meta">${escapeHTML(r.title || '')}<br>
           ${new Date(r.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 正确率 ${acc}% ·
           <a href="#" id="link-last-review" style="color:var(--accent)">查看解析 ›</a></div>`;
      card.classList.remove('hidden');
      $('link-last-review').addEventListener('click', ev => {
        ev.preventDefault();
        const exam = Storage.getExam(r.examId);
        if (exam) showResult(exam, null);
        else toast('试卷缓存已被清理');
      });
    } else {
      card.classList.add('hidden');
    }
    Heatmap.render($('heatmap-mini'), Storage.getDailyMap(), { mini: true });
  }
  $('link-heat-history').addEventListener('click', ev => { ev.preventDefault(); switchTab('history'); });

  /* ═══════════ 考试页 ═══════════ */
  function openExam(exam, answers) {
    state.exam = exam;
    state.answers = answers || {};
    renderExam();
    $('screen-exam').classList.remove('hidden');
    $('exam-content').scrollTop = 0;
  }

  function renderExam() {
    const exam = state.exam;
    $('exam-nav-title').textContent = exam.title;
    const box = $('exam-content');
    box.innerHTML = '';
    let qNo = 0;

    for (const p of exam.passages) {
      const card = document.createElement('div');
      card.className = 'card passage-card';
      let html = `<span class="passage-genre">${escapeHTML(Generator.GENRE_FULL[p.genreTag] || p.genreTag)}</span>
        <div class="passage-title">${escapeHTML(p.title)}</div>
        <div class="passage-text">${escapeHTML(p.text)}</div>`;
      html += `<div class="question-block">`;
      p.questions.forEach((q, qi) => {
        qNo++;
        html += `<div class="review-q question-prompt"><span class="q-num">${qNo}</span><span>${escapeHTML(q.prompt)}</span></div>`;
        q.options.forEach((opt, oi) => {
          const sel = state.answers[p.id] && state.answers[p.id][qi] === oi;
          html += `<button class="option${sel ? ' selected' : ''}" data-p="${p.id}" data-q="${qi}" data-o="${oi}">
            <span class="opt-mark">${OPT_MARKS[oi]}</span><span>${escapeHTML(opt)}</span></button>`;
        });
      });
      html += `</div>`;
      card.innerHTML = html;
      box.appendChild(card);
    }
    updateExamProgress();
  }

  $('exam-content').addEventListener('click', e => {
    const btn = e.target.closest('.option');
    if (!btn) return;
    const pid = btn.dataset.p, qi = +btn.dataset.q, oi = +btn.dataset.o;
    if (!state.answers[pid]) state.answers[pid] = {};
    state.answers[pid][qi] = state.answers[pid][qi] === oi ? undefined : oi;
    if (state.answers[pid][qi] === undefined) delete state.answers[pid][qi];
    // 局部刷新选中态
    btn.parentElement.querySelectorAll('.option').forEach(x => {
      if (+x.dataset.q === qi) x.classList.remove('selected');
    });
    if (state.answers[pid][qi] != null) btn.classList.add('selected');
    updateExamProgress();
  });

  function updateExamProgress() {
    const total = state.exam.totalQuestions;
    const done = countAnswered(state.answers, state.exam);
    $('exam-progress').style.width = `${(done / total * 100).toFixed(1)}%`;
    $('exam-progress-label').textContent = `${done}/${total}`;
  }

  $('btn-exam-back').addEventListener('click', async () => {
    const done = countAnswered(state.answers, state.exam);
    if (done > 0) {
      Storage.saveDraft({ ts: Date.now(), exam: state.exam, answers: state.answers });
      toast('已保存草稿，可随时继续');
    }
    closeExam();
  });

  async function closeExam() {
    $('screen-exam').classList.add('hidden');
    renderHome();
  }

  $('btn-exam-submit').addEventListener('click', async () => {
    const total = state.exam.totalQuestions;
    const done = countAnswered(state.answers, state.exam);
    if (done < total) {
      const ok = await showDialog('还有未答题目',
        `已答 ${done}/${total} 問，未答的题目将计为错误。确定提交吗？`,
        [{ label: '继续作答', value: false }, { label: '提交', value: true, bold: true }]);
      if (!ok) return;
    }
    submitExam();
  });

  function submitExam() {
    const grade = Generator.gradeExam(state.exam, state.answers);
    const record = {
      id: 'r' + state.exam.id,
      examId: state.exam.id,
      ts: Date.now(),
      date: Heatmap.fmtDate(new Date()),
      mode: state.exam.mode,
      level: state.exam.level,
      title: state.exam.title,
      total: grade.total,
      correct: grade.correct
    };
    Storage.addRecord(record);
    state.exam.passages.forEach(p => { p.score = p._score; delete p._score; });
    state.exam.answers = state.answers;
    Storage.saveExam(state.exam);
    Storage.clearDraft();
    $('screen-exam').classList.add('hidden');
    showResult(state.exam, grade);
  }

  /* ═══════════ 结果页 ═══════════ */
  function showResult(exam, grade) {
    // grade 为 null 时（回看）按存储的作答重新计分
    const answers = (grade ? state.answers : (exam.answers || {}));
    if (!grade) grade = Generator.gradeExam(exam, answers);
    state.result = { exam, answers, grade };

    const acc = grade.total ? grade.correct / grade.total : 0;
    const cls = acc >= 0.7 ? 'good' : acc >= 0.5 ? 'mid' : 'bad';
    const box = $('result-content');
    let html = `
      <div class="score-hero">
        ${cls === 'good' ? '<svg class="ic score-trophy" viewBox="1.50 1.50 7.00 7.00"><path d="M5.915 2.1c.396 0 .594 0 .736.125.019.016.04.038.056.057.086.105.107.23.107.432 0 .125.113.22.236.204.283-.035.646-.03.95.16.336.21.5.58.5 1.049 0 .492-.194.872-.486 1.144-.28.262-.635.413-.955.503a4.3 4.3 0 0 1-.94.148.25.25 0 0 0-.172.078c-.131.133-.132.393.008.517.164.147.31.321.427.503.143.22.214.33.115.573a1 1 0 0 1-.051.095c-.15.215-.332.215-.697.214h-1.5c-.364-.001-.547-.002-.696-.217a1 1 0 0 1-.05-.094c-.1-.243-.028-.353.115-.572.112-.174.25-.34.406-.483.147-.134.146-.411.01-.555a.28.28 0 0 0-.186-.088l-.033-.001a4.3 4.3 0 0 1-.874-.145c-.32-.09-.675-.241-.955-.503A1.52 1.52 0 0 1 1.5 4.1c0-.47.164-.84.5-1.05.305-.19.667-.195.95-.16a.207.207 0 0 0 .234-.2c.003-.189.026-.31.11-.41a1 1 0 0 1 .055-.058c.142-.124.34-.125.737-.124zM7.15 3.712l-.04.006c-.223.033-.374.23-.41.451q-.045.28-.116.555c-.043.164.094.327.257.28.255-.071.475-.176.626-.317a.72.72 0 0 0 .233-.56c0-.278-.086-.347-.124-.371-.071-.044-.209-.071-.426-.044m-4.3-.027c-.217-.028-.355 0-.426.044-.038.024-.124.092-.124.37 0 .259.094.43.233.56.15.141.37.246.626.319.159.044.293-.113.251-.273a6 6 0 0 1-.115-.56c-.036-.223-.188-.422-.411-.456z"/></svg>' : ''}
        <div class="score-big ${cls}">${grade.correct}<span style="font-size:24px"> / ${grade.total}</span></div>
        <div class="score-sub">${exam.title} · 正确率 ${(acc * 100).toFixed(0)}%</div>
      </div>
      <div class="card"><div class="card-label">各篇得分</div>`;
    for (const p of exam.passages) {
      const s = p.score != null ? p.score : grade.detail.filter(d => d.passageId === p.id && d.ok).length;
      html += `<div class="passage-score-row">
        <span class="ps-name">${escapeHTML(Generator.GENRE_FULL[p.genreTag] || p.genreTag)} · ${escapeHTML(p.title)}</span>
        <span class="ps-score">${s} / ${p.questions.length}</span></div>`;
    }
    html += `</div><div class="card"><div class="card-label">逐题解析</div>`;

    let qNo = 0;
    for (const p of exam.passages) {
      p.questions.forEach((q, qi) => {
        qNo++;
        const d = grade.detail.find(x => x.passageId === p.id && x.qIndex === qi);
        const userTxt = d && d.user != null ? `${OPT_MARKS[d.user]} ${q.options[d.user]}` : '未作答';
        const rightTxt = `${OPT_MARKS[q.answer]} ${q.options[q.answer]}`;
        html += `<div class="review-block">
          <div class="review-q"><span class="q-num">${qNo}</span>${escapeHTML(q.prompt)}</div>
          <div class="review-line ${d && d.ok ? 'ans-right' : 'ans-wrong'}"><span class="tag">你的答案</span><span>${escapeHTML(userTxt)}</span></div>
          ${d && d.ok ? '' : `<div class="review-line ans-right"><span class="tag">正确答案</span><span>${escapeHTML(rightTxt)}</span></div>`}
          <div class="review-exp">${escapeHTML(q.explanation)}</div>
        </div>`;
      });
    }
    html += `</div><div style="height:24px"></div>`;
    box.innerHTML = html;
    $('screen-result').classList.remove('hidden');
    box.scrollTop = 0;
  }

  $('btn-result-back').addEventListener('click', () => {
    $('screen-result').classList.add('hidden');
    renderHome();
  });

  /* ═══════════ 记录页 ═══════════ */
  function renderHistory() {
    const stats = Storage.getStats();
    $('stat-days').textContent = stats.days;
    $('stat-questions').textContent = stats.questions;
    $('stat-acc').textContent = stats.accuracy == null ? '–' : `${Math.round(stats.accuracy * 100)}%`;
    $('stat-streak').textContent = stats.streak;

    $('heat-year-label').textContent = state.heatYear;
    Heatmap.render($('heatmap-full'), Storage.getDailyMap(), { year: state.heatYear });

    const records = Storage.getRecords().slice(0, 50);
    const list = $('record-list');
    if (!records.length) {
      list.innerHTML = '<div style="color:var(--label-3);font-size:14px;padding:8px 0">还没有练习记录，去首页开始第一套题吧。</div>';
      return;
    }
    list.innerHTML = '';
    records.forEach(r => {
      const acc = r.total ? r.correct / r.total : 0;
      const cls = acc >= 0.7 ? 'good' : acc >= 0.5 ? 'mid' : 'bad';
      const li = document.createElement('li');
      li.innerHTML = `<button class="record-item" data-exam="${r.examId}">
        <span class="record-date">${r.date.slice(5)}</span>
        <span class="record-mode">${escapeHTML(r.title || '')}</span>
        <span class="record-acc ${cls}">${r.correct}/${r.total}</span></button>`;
      li.querySelector('.record-item').addEventListener('click', () => {
        const exam = Storage.getExam(r.examId);
        if (!exam) { toast('试卷缓存已被清理，无法回看'); return; }
        showResult(exam, null);
      });
      list.appendChild(li);
    });
  }

  $('btn-year-prev').addEventListener('click', () => {
    if (state.heatYear > 2020) { state.heatYear--; renderHistory(); }
  });
  $('btn-year-next').addEventListener('click', () => {
    const nowY = new Date().getFullYear();
    if (state.heatYear < nowY) { state.heatYear++; renderHistory(); }
  });
  $('heatmap-full').addEventListener('heatcell', e => toast(e.detail.text, 3000));
  $('heatmap-mini').addEventListener('heatcell', e => toast(e.detail.text, 3000));

  /* ═══════════ 设置页 ═══════════ */
  const PRESETS = {
    openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    deepseek: { baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    zhipu: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    openrouter: { baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
    custom: {}
  };

  function loadSettingsUI() {
    const s = Storage.getSettings();
    $('set-provider').value = s.provider;
    $('set-baseurl').value = s.baseURL;
    $('set-apikey').value = s.apiKey;
    $('set-model').value = s.model;
    $('set-temp').value = s.temperature;
    $('set-jsonmode').classList.toggle('on', !!s.jsonMode);
    $('set-jsonmode').setAttribute('aria-checked', String(!!s.jsonMode));
    $('seg-theme').querySelectorAll('.seg-item').forEach(x =>
      x.classList.toggle('active', (x.dataset.theme || 'auto') === (s.theme || 'auto')));
    applyTheme(s.theme || 'auto');
  }

  function saveSettingsUI() {
    Storage.saveSettings({
      provider: $('set-provider').value,
      baseURL: $('set-baseurl').value.trim(),
      apiKey: $('set-apikey').value.trim(),
      model: $('set-model').value.trim(),
      temperature: parseFloat($('set-temp').value) || 0.7
    });
  }

  $('set-provider').addEventListener('change', () => {
    const p = PRESETS[$('set-provider').value];
    if (p && p.baseURL) {
      $('set-baseurl').value = p.baseURL;
      $('set-model').value = p.model;
    }
    saveSettingsUI();
  });
  ['set-baseurl', 'set-apikey', 'set-model', 'set-temp'].forEach(id =>
    $(id).addEventListener('change', saveSettingsUI));

  $('set-jsonmode').addEventListener('click', () => {
    const on = !$('set-jsonmode').classList.contains('on');
    $('set-jsonmode').classList.toggle('on', on);
    $('set-jsonmode').setAttribute('aria-checked', String(on));
    Storage.saveSettings({ jsonMode: on });
  });

  $('btn-test-api').addEventListener('click', async () => {
    saveSettingsUI();
    const s = Storage.getSettings();
    const box = $('api-test-result');
    box.classList.remove('hidden', 'ok', 'err');
    box.textContent = '正在测试…';
    try {
      const reply = await Api.chat(s, [
        { role: 'user', content: '请只回复两个字：成功' }
      ], { temperature: 0, jsonMode: false });
      box.classList.add('ok');
      box.textContent = `✓ 连接成功（模型回复：${reply.trim().slice(0, 40)}）`;
    } catch (e) {
      box.classList.add('err');
      box.textContent = `✗ ${e.message}`;
    }
  });

  $('btn-clear-records').addEventListener('click', async () => {
    const ok = await showDialog('清空练习记录', '所有历史记录、热力图与试卷缓存将被删除（不影响 API 设置与草稿）。确定吗？',
      [{ label: '取消', value: false }, { label: '清空', value: true, destructive: true, bold: true }]);
    if (!ok) return;
    Storage.clearRecords();
    Storage.clearExams();
    toast('已清空练习记录');
    renderHome();
  });

  $('btn-clear-all').addEventListener('click', async () => {
    const ok = await showDialog('清空全部数据', '包括 API 设置在内的所有本机数据都将被删除且不可恢复。确定吗？',
      [{ label: '取消', value: false }, { label: '全部清空', value: true, destructive: true, bold: true }]);
    if (!ok) return;
    Storage.clearAll();
    loadSettingsUI();
    renderHome();
    toast('已清空全部数据');
  });

  /* ═══════════ 工具 & 启动 ═══════════ */
  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Service Worker（仅 http/https 环境，file:// 自动跳过） */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(e =>
      console.warn('[sw] 注册失败（不影响使用）:', e));
  }

  /* 保存进行中的考试（页面隐藏时兜底存草稿） */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' &&
      !$('screen-exam').classList.contains('hidden') && state.exam) {
      Storage.saveDraft({ ts: Date.now(), exam: state.exam, answers: state.answers });
    }
  });

  loadSettingsUI();
  updateModeHint();
  renderHome();
})();
