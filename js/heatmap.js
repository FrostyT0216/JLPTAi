/* ══════════ heatmap.js — GitHub 风格每日正确率热力图 ══════════ */
(function () {
  'use strict';

  const WEEKS = 26; // 迷你图默认 26 周

  function fmtDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function levelOf(acc) {
    if (acc == null) return 0;
    if (acc < 0.5) return 1;
    if (acc < 0.7) return 2;
    if (acc < 0.85) return 3;
    return 4;
  }

  /**
   * 渲染热力图到容器。
   * @param {HTMLElement} container
   * @param {Object} dailyMap {'YYYY-MM-DD': {total, correct}}
   * @param {{year?:number, mini?:boolean}} opts  year 指定渲染某一年（1月~12月/或截止今天），mini 最近26周
   */
  function render(container, dailyMap, opts = {}) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'heatmap-scroll';

    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start, end;
    if (opts.mini) {
      end = today;
      start = new Date(end);
      start.setDate(start.getDate() - (WEEKS * 7 - 1));
      // 对齐到周日列首
      start.setDate(start.getDate() - start.getDay());
    } else {
      const y = opts.year || today.getFullYear();
      start = new Date(y, 0, 1);
      start.setDate(start.getDate() - start.getDay()); // 对齐周首列
      end = (y === today.getFullYear()) ? today : new Date(y, 11, 31);
      if (y > today.getFullYear()) { container.appendChild(wrap); return; }
    }

    // 月份标签行
    const months = document.createElement('div');
    months.className = 'heat-month-labels';

    let colDate = new Date(start);
    let curMonth = -1;
    const monthLabelCols = [];
    while (colDate <= end) {
      if (colDate.getMonth() !== curMonth) {
        curMonth = colDate.getMonth();
        monthLabelCols.push({ col: monthLabelCols.length, label: `${curMonth + 1}月` });
      }
      colDate.setDate(colDate.getDate() + 7);
    }
    for (let i = 0; i < monthLabelCols.length; i++) {
      const span = document.createElement('span');
      span.className = 'heat-month-label';
      span.textContent = i === 0 ? '' : monthLabelCols[i].label;
      months.appendChild(span);
    }

    // 按列（周）填充：每周日→周六一列
    const d = new Date(start);
    let col = [];
    const flushCol = () => {
      if (!col.length) return;
      const colEl = document.createElement('div');
      colEl.className = 'heat-col';
      col.forEach(c => colEl.appendChild(c));
      grid.appendChild(colEl);
      col = [];
    };
    while (d <= end) {
      const key = fmtDate(d);
      const day = dailyMap[key];
      const acc = (day && day.total > 0) ? day.correct / day.total : null;
      const cell = document.createElement('span');
      cell.className = 'heat-cell';
      cell.dataset.v = String(levelOf(acc));
      const title = day
        ? `${key}　正确率 ${(acc * 100).toFixed(0)}%（${day.correct}/${day.total}）`
        : `${key}　无记录`;
      cell.title = title;
      cell.addEventListener('click', () => {
        const ev = new CustomEvent('heatcell', { detail: { date: key, text: title } });
        container.dispatchEvent(ev);
      });
      col.push(cell);
      if (d.getDay() === 6 || (d.getTime() === end.getTime())) flushCol();
      d.setDate(d.getDate() + 1);
    }
    flushCol();

    wrap.appendChild(months);
    wrap.appendChild(grid);
    container.appendChild(wrap);
    // 默认滚动到最右侧（最新日期）
    requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  }

  window.Heatmap = { render, fmtDate };
})();
