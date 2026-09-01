/* ══════════ storage.js — localStorage 长期存储层 ══════════ */
(function () {
  'use strict';

  const KEYS = {
    settings: 'jlpt.settings.v1',
    records: 'jlpt.records.v1',
    exams: 'jlpt.exams.v1',
    draft: 'jlpt.draft.v1'
  };

  const DEFAULT_SETTINGS = {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    jsonMode: true,
    theme: 'auto', // auto | light | dark
    accent: 'green', // green | blue | purple | pink | orange | custom
    accentCustom: '', // 自定义主题色（#RRGGBB）
    background: 'blob' // blob 波动色块动画 | bing Bing 每日图片
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) {
      console.warn('[storage] 读取失败，回退默认值:', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[storage] 写入失败:', key, e);
      return false;
    }
  }

  const Storage = {
    KEYS,

    /* ── 设置 ── */
    getSettings() {
      const s = read(KEYS.settings, {});
      return Object.assign({}, DEFAULT_SETTINGS, s);
    },
    saveSettings(patch) {
      const s = Object.assign(this.getSettings(), patch);
      write(KEYS.settings, s);
      return s;
    },

    /* ── 历史记录 ── */
    getRecords() { return read(KEYS.records, []); },
    addRecord(rec) {
      const list = this.getRecords();
      list.unshift(rec);
      write(KEYS.records, list);
      return list;
    },
    clearRecords() { write(KEYS.records, []); },

    /* 按 YYYY-MM-DD 聚合每日 {total, correct} */
    getDailyMap() {
      const map = {};
      for (const r of this.getRecords()) {
        if (!r.date) continue;
        if (!map[r.date]) map[r.date] = { total: 0, correct: 0, count: 0 };
        map[r.date].total += r.total || 0;
        map[r.date].correct += r.correct || 0;
        map[r.date].count += 1;
      }
      return map;
    },

    /* ── 已完成试卷缓存（保留最近 20 套） ── */
    getExams() { return read(KEYS.exams, []); },
    getExam(id) { return this.getExams().find(e => e.id === id) || null; },
    saveExam(exam) {
      let list = this.getExams().filter(e => e.id !== exam.id);
      list.unshift(exam);
      if (list.length > 20) list = list.slice(0, 20);
      write(KEYS.exams, list);
    },
    clearExams() { write(KEYS.exams, []); },

    /* ── 草稿 ── */
    getDraft() { return read(KEYS.draft, null); },
    saveDraft(draft) { write(KEYS.draft, draft); },
    clearDraft() { localStorage.removeItem(KEYS.draft); },

    /* ── 数据管理 ── */
    clearAll() {
      Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    },

    /* ── 导出 / 导入（不含 API 配置） ── */
    exportData() {
      return {
        app: 'jlpt-reading',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          records: this.getRecords(),
          exams: this.getExams(),
          draft: this.getDraft()
        }
      };
    },

    /* mode: 'merge' 合并去重 | 'replace' 覆盖现有数据（仅数据，不影响 API 设置） */
    importData(parsed, mode) {
      if (!parsed || parsed.app !== 'jlpt-reading' || !parsed.data) {
        throw new Error('文件格式不正确，请使用本应用导出的备份文件');
      }
      const d = parsed.data;
      if (d.records != null && !Array.isArray(d.records)) throw new Error('练习记录数据损坏');
      if (d.exams != null && !Array.isArray(d.exams)) throw new Error('试卷缓存数据损坏');

      if (mode === 'replace') {
        write(KEYS.records, d.records || []);
        write(KEYS.exams, (d.exams || []).slice(0, 20));
        if (d.draft && d.draft.exam) this.saveDraft(d.draft); else localStorage.removeItem(KEYS.draft);
      } else {
        const recs = this.getRecords();
        const recIds = new Set(recs.map(r => r.id));
        for (const r of (d.records || [])) {
          if (r && r.id && !recIds.has(r.id)) { recs.push(r); recIds.add(r.id); }
        }
        // 按时间倒序整理
        recs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        write(KEYS.records, recs);

        const exams = this.getExams();
        const examIds = new Set(exams.map(e => e.id));
        for (const e of (d.exams || [])) {
          if (e && e.id && !examIds.has(e.id)) { exams.push(e); examIds.add(e.id); }
        }
        exams.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        write(KEYS.exams, exams.slice(0, 20));

        if (d.draft && d.draft.exam && !this.getDraft()) {
          this.saveDraft(d.draft);
        }
      }
      return {
        records: (d.records || []).length,
        exams: (d.exams || []).length,
        hasDraft: !!(d.draft && d.draft.exam)
      };
    },

    /* 统计摘要 */
    getStats() {
      const records = this.getRecords();
      const daily = this.getDailyMap();
      let total = 0, correct = 0;
      for (const d of Object.values(daily)) { total += d.total; correct += d.correct; }
      return {
        days: Object.keys(daily).length,
        questions: total,
        accuracy: total > 0 ? correct / total : null,
        streak: this.calcStreak(daily)
      };
    },

    calcStreak(daily) {
      const dates = Object.keys(daily).sort();
      if (!dates.length) return 0;
      const set = new Set(dates);
      const fmt = d => d.toISOString().slice(0, 10);
      let day = new Date();
      // 今天没练习则从昨天起算连续
      if (!set.has(fmt(day))) day.setDate(day.getDate() - 1);
      let streak = 0;
      while (set.has(fmt(day))) {
        streak++;
        day.setDate(day.getDate() - 1);
      }
      return streak;
    }
  };

  window.Storage = Storage;
})();
