/* ══════════ api.js — OpenAI 兼容 Chat Completions 客户端 + JSON 容错解析 ══════════ */
(function () {
  'use strict';

  const TIMEOUT_MS = 120000;

    /**
     * 调用 chat/completions，返回 assistant 文本。
     * @param {object} settings Storage.getSettings()
     * @param {Array<{role,content}>} messages
     * @param {{jsonMode?:boolean, temperature?:number, signal?:AbortSignal, onUsage?:(usage:object)=>void}} opts
     */
  async function chat(settings, messages, opts = {}) {
    const base = (settings.baseURL || '').replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';

    const body = {
      model: settings.model,
      messages,
      temperature: opts.temperature != null ? opts.temperature : settings.temperature
    };
    const jsonMode = opts.jsonMode != null ? opts.jsonMode : settings.jsonMode;
    if (jsonMode) {
      // OpenAI / DeepSeek / 智谱等兼容字段；不支持的服务端会报错，由调用方降级重试
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    if (opts.signal) {
      if (opts.signal.aborted) { clearTimeout(timer); throw new DOMException('Aborted', 'AbortError'); }
      opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('请求已取消或超时');
      throw new Error('网络请求失败：' + e.message + '（请检查网络与 API 地址，且该服务允许浏览器跨域 CORS）');
    }
    clearTimeout(timer);

    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = (err.error && err.error.message) || JSON.stringify(err).slice(0, 200);
      } catch (_) { detail = res.statusText; }
      const hint = res.status === 401 ? '（API Key 无效）' :
        res.status === 404 ? '（接口或模型不存在，检查 API 地址与模型名）' :
        res.status === 400 && /response_format/i.test(detail) ? '（该服务不支持 response_format，可在设置中关闭「强制 JSON 模式」）' : '';
      throw new Error(`API 错误 ${res.status}: ${detail}${hint}`);
    }

    const data = await res.json();
    if (opts.onUsage && data.usage) {
      try { opts.onUsage(data.usage); } catch (_) { /* 忽略回调异常 */ }
    }
    const content = data.choices && data.choices[0] && data.choices[0].message &&
      data.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('API 返回了空内容');
    }
    return content;
  }

  /** 从任意文本中容错提取 JSON 对象（剥离围栏、截取大括号范围） */
  function extractJSON(text) {
    let t = text.trim();
    // 剥离 markdown 代码围栏
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    // 截取首个 { 到最后一个 }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('未能从返回内容中找到 JSON');
    }
    return JSON.parse(t.slice(start, end + 1));
  }

  /**
   * 调用 API 并强制解析为 JSON；失败自动降级（关闭 response_format）重试一次。
   */
  async function chatJSON(settings, messages, opts = {}) {
    const attempts = [];
    if (opts.jsonMode !== false && settings.jsonMode) {
      attempts.push({ jsonMode: true });
    }
    attempts.push({ jsonMode: false });

    let lastErr;
    for (const a of attempts) {
      try {
        const text = await chat(settings, messages, Object.assign({}, opts, a));
        return extractJSON(text);
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError' || /已取消/.test(e.message)) throw e;
        // 解析失败或 response_format 不支持 → 尝试下一策略；网络/鉴权错误不重试
        if (/网络请求失败|API 错误 401|API 错误 403/.test(e.message)) throw e;
      }
    }
    throw lastErr || new Error('生成失败');
  }

  window.Api = { chat, chatJSON, extractJSON };
})();
