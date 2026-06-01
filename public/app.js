const expenseList = document.querySelector('#expense-list');
const summaryIncome = document.querySelector('#summary-income');
const summaryExpense = document.querySelector('#summary-expense');
const summaryTotal = document.querySelector('#summary-total');
const summaryTotalTile = document.querySelector('.summary-tile.total');
const form = document.querySelector('#expense-form');
const categorySelect = document.querySelector('#category');
const dateInput = document.querySelector('#date');

const EXPENSE_CATEGORIES = ['Food', 'Utilities', 'Shopping', 'Transport', 'Other'];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'];

const CHART_THEME = {
  text: '#5C4800',
  axis: '#FFE6B3',
  split: '#FFF2E6',
  monthly: ['#FFCC00', '#FFDB4D'],
  daily: '#FFDB4D',
  income: '#FFCC00',
  expense: '#5C4800'
};

const PIE_COLORS = [
  '#FFCC00',
  '#FFDB4D',
  '#5C4800',
  '#FFE6B3',
  '#FFDB4D',
  '#FFE6B3',
  '#FFCC00',
  '#FFF2E6'
];

const formatCurrency = (value) =>
  Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

function formatChartAxis(value) {
  const v = Number(value);
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${v}`;
}

let monthlyChart = null;
let dailyChart = null;
let overallPieChart = null;
let cachedExpenses = [];
let resizeTimer = null;
let monthlyBuckets = [];
let selectedMonthKey = null;

const monthPicker = document.querySelector('#month-picker');
const monthlyDetailEl = document.querySelector('#monthly-detail');

function getChartLayout() {
  const width = window.innerWidth;
  return {
    compact: width < 640,
    narrow: width < 768,
    tablet: width < 1024
  };
}

function normalizeDateString(date) {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (raw.includes('T')) return raw.slice(0, 10);
  if (raw.length >= 10) return raw.slice(0, 10);
  return raw;
}

function toMonthKey(date) {
  const parts = normalizeDateString(date).split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}`;
  }
  return normalizeDateString(date).slice(0, 7);
}

function toDayKey(date) {
  const parts = normalizeDateString(date).split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
  }
  return normalizeDateString(date);
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function getOrInitChart(el) {
  if (!el) return null;

  let chart = echarts.getInstanceByDom(el);
  if (chart) {
    return chart;
  }

  chart = echarts.init(el, null, { renderer: 'canvas' });

  if (!el._chartObserved) {
    const observer = new ResizeObserver(() => {
      const instance = echarts.getInstanceByDom(el);
      if (instance && el.clientWidth > 0 && el.clientHeight > 0) {
        instance.resize();
      }
    });
    observer.observe(el);
    el._chartObserved = true;
  }

  return chart;
}

function setChartOption(chart, option) {
  if (!chart) return;
  chart.setOption(option, { notMerge: true, lazyUpdate: false });
}

function resizeAllCharts() {
  requestAnimationFrame(() => {
    overallPieChart?.resize();
    monthlyChart?.resize();
    dailyChart?.resize();
  });
}

function waitForChartContainers() {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const monthlyEl = document.getElementById('monthly-chart');
      const dailyEl = document.getElementById('daily-chart');
      const ready =
        monthlyEl &&
        dailyEl &&
        monthlyEl.clientWidth > 0 &&
        dailyEl.clientHeight > 0;

      if (ready || attempts > 30) {
        resolve();
        return;
      }
      attempts += 1;
      requestAnimationFrame(check);
    };
    check();
  });
}

function isExpenseEntry(entry) {
  return (entry.type || 'expense') === 'expense';
}

function isIncomeEntry(entry) {
  return (entry.type || 'expense') === 'income';
}

function getAmount(entry) {
  return Number(entry.amount) || 0;
}

function aggregateMonthly(expenses) {
  const buckets = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      income: 0,
      expense: 0
    });
  }
  const map = Object.fromEntries(buckets.map((b) => [b.key, b]));
  expenses.forEach((e) => {
    const key = toMonthKey(e.date);
    if (!map[key]) return;
    const amount = getAmount(e);
    if (isIncomeEntry(e)) map[key].income += amount;
    else map[key].expense += amount;
  });
  return buckets;
}

function aggregateDaily(expenses, monthKey) {
  const buckets = [];
  const keyMonth = monthKey || toMonthKey(new Date());
  const [year, month] = keyMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${keyMonth}-${String(day).padStart(2, '0')}`;
    buckets.push({ key, label: String(day), income: 0, expense: 0 });
  }

  const map = Object.fromEntries(buckets.map((b) => [b.key, b]));
  expenses.forEach((e) => {
    const key = toDayKey(e.date);
    if (!map[key]) return;
    const amount = getAmount(e);
    if (isIncomeEntry(e)) map[key].income += amount;
    else map[key].expense += amount;
  });
  return buckets;
}

function getTransactionsForMonth(expenses, monthKey) {
  return expenses
    .filter((e) => toMonthKey(e.date) === monthKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function ensureSelectedMonth(buckets) {
  const currentKey = toMonthKey(new Date());
  const hasCurrent = buckets.some((b) => b.key === currentKey);
  const fallback =
    buckets.find((b) => b.income > 0 || b.expense > 0)?.key || buckets[buckets.length - 1]?.key;

  if (!selectedMonthKey || !buckets.some((b) => b.key === selectedMonthKey)) {
    selectedMonthKey = hasCurrent ? currentKey : fallback || currentKey;
  }
}

function getChartMaxValue(buckets, keys = ['income', 'expense']) {
  let max = 0;
  buckets.forEach((b) => {
    keys.forEach((k) => {
      if (b[k] > max) max = b[k];
    });
  });
  return max;
}

function syncMonthPicker(buckets) {
  if (!monthPicker) return;
  monthPicker.innerHTML = buckets
    .map(
      (b) =>
        `<option value="${b.key}"${b.key === selectedMonthKey ? ' selected' : ''}>${formatMonthLabel(b.key)}</option>`
    )
    .join('');
}

function renderMonthlyDetail(expenses) {
  if (!monthlyDetailEl || !selectedMonthKey) return;

  const transactions = getTransactionsForMonth(expenses, selectedMonthKey);
  const incomeTotal = transactions.filter(isIncomeEntry).reduce((s, e) => s + getAmount(e), 0);
  const expenseTotal = transactions.filter(isExpenseEntry).reduce((s, e) => s + getAmount(e), 0);
  const label = formatMonthLabel(selectedMonthKey);

  monthlyDetailEl.hidden = false;

  if (!transactions.length) {
    monthlyDetailEl.innerHTML = `
      <div class="monthly-detail-header">
        <h4>${escapeHtml(label)}</h4>
      </div>
      <p class="monthly-detail-empty">No income or expenses recorded for this month.</p>
    `;
    return;
  }

  monthlyDetailEl.innerHTML = `
    <div class="monthly-detail-header">
      <h4>${escapeHtml(label)}</h4>
      <div class="monthly-detail-totals">
        <span class="monthly-detail-income">Income: ${formatCurrency(incomeTotal)}</span>
        <span class="monthly-detail-expense">Expense: ${formatCurrency(expenseTotal)}</span>
      </div>
    </div>
    <div class="monthly-detail-list">
      ${transactions
        .map((e) => {
          const isIncome = isIncomeEntry(e);
          return `
        <div class="monthly-detail-item">
          <span>
            <span class="type-pill ${isIncome ? 'income' : 'expense'}">${isIncome ? 'Income' : 'Expense'}</span>
            ${escapeHtml(e.description)} · ${escapeHtml(e.category)} · ${escapeHtml(e.date)}
          </span>
          <span class="${isIncome ? 'detail-amount-income' : 'detail-amount-expense'}">${formatCurrency(e.amount)}</span>
        </div>
      `;
        })
        .join('')}
    </div>
  `;
}

function onMonthSelected(expenses) {
  syncMonthPicker(monthlyBuckets);
  renderMonthlyDetail(expenses);
  updateMonthlyChartSeries();
  renderDailyChart(expenses);
}

function updateMonthlyChartSeries() {
  if (!monthlyChart || !monthlyBuckets.length) return;
  setChartOption(monthlyChart, buildMonthlyChartOption());
}

function chartTooltip() {
  return {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderColor: 'rgba(209, 213, 219, 0.9)',
    textStyle: { color: '#5C4800' }
  };
}

function baseChartOption() {
  const { compact, narrow } = getChartLayout();
  return {
    backgroundColor: 'transparent',
    textStyle: { color: CHART_THEME.text, fontSize: compact ? 10 : 12 },
    grid: {
      left: compact ? 36 : 48,
      right: compact ? 8 : 20,
      top: compact ? 28 : 36,
      bottom: compact ? 64 : narrow ? 56 : 48
    },
    tooltip: {
      trigger: 'axis',
      ...chartTooltip(),
      valueFormatter: (v) => formatCurrency(v)
    }
  };
}

function aggregateOverall(expenses) {
  const slices = [];
  let incomeTotal = 0;

  expenses.forEach((entry) => {
    const amount = Number(entry.amount);
    if ((entry.type || 'expense') === 'income') {
      incomeTotal += amount;
    } else {
      const name = entry.category || 'Other';
      const existing = slices.find((s) => s.name === name);
      if (existing) existing.value += amount;
      else slices.push({ name, value: amount });
    }
  });

  if (incomeTotal > 0) {
    slices.unshift({ name: 'Income', value: incomeTotal, isIncome: true });
  }

  return slices.sort((a, b) => b.value - a.value);
}

function renderOverallPieChart(expenses) {
  const el = document.getElementById('overall-pie-chart');
  if (!el || typeof echarts === 'undefined') return;

  overallPieChart = getOrInitChart(el);
  const data = aggregateOverall(expenses);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!total) {
    setChartOption(overallPieChart, {
      backgroundColor: 'transparent',
      title: {
        text: 'No data yet',
        left: 'center',
        top: 'center',
        textStyle: { color: CHART_THEME.text, fontSize: 14, fontWeight: 500 }
      },
      series: []
    });
    resizeAllCharts();
    return;
  }

  const { compact } = getChartLayout();

  setChartOption(overallPieChart, {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      ...chartTooltip(),
      formatter: (params) => {
        const pct = params.percent.toFixed(1);
        return `${params.name}<br/>${formatCurrency(params.value)} (${pct}%)`;
      }
    },
    legend: compact
      ? {
          orient: 'horizontal',
          bottom: 0,
          left: 'center',
          itemWidth: 12,
          itemHeight: 12,
          textStyle: { color: CHART_THEME.text, fontSize: 11 }
        }
      : {
          orient: 'vertical',
          right: 0,
          top: 'center',
          itemWidth: 12,
          itemHeight: 12,
          textStyle: { color: CHART_THEME.text }
        },
    series: [
      {
        name: 'Overall',
        type: 'pie',
        radius: compact ? ['32%', '52%'] : ['42%', '68%'],
        center: compact ? ['50%', '40%'] : ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: !compact,
          color: CHART_THEME.text,
          formatter: '{b}\n{d}%'
        },
        labelLine: {
          show: !compact
        },
        data: (() => {
          let colorIndex = 0;
          return data.map((item) => ({
            name: item.name,
            value: item.value,
            itemStyle: {
              color: item.isIncome
                ? CHART_THEME.income
                : PIE_COLORS[colorIndex++ % PIE_COLORS.length]
            }
          }));
        })()
      }
    ]
  });
  resizeAllCharts();
}

function buildMonthlyChartOption() {
  const { compact } = getChartLayout();
  const base = baseChartOption();

  return {
    ...base,
    legend: {
      data: ['Income', 'Expense'],
      bottom: 0,
      textStyle: { color: CHART_THEME.text, fontSize: compact ? 10 : 12 }
    },
    grid: {
      ...base.grid,
      bottom: compact ? 72 : 64
    },
    xAxis: {
      type: 'category',
      data: monthlyBuckets.map((d) => d.label),
      axisLine: { lineStyle: { color: CHART_THEME.axis } },
      axisLabel: {
        color: CHART_THEME.text,
        rotate: compact ? 45 : 30,
        fontSize: compact ? 10 : 11,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: CHART_THEME.split } },
      axisLabel: {
        color: CHART_THEME.text,
        formatter: (v) => formatChartAxis(v)
      }
    },
    series: [
      {
        name: 'Income',
        type: 'bar',
        data: monthlyBuckets.map((d) => d.income),
        barMaxWidth: compact ? 22 : 32,
        itemStyle: { color: CHART_THEME.income, borderRadius: [4, 4, 0, 0] }
      },
      {
        name: 'Expense',
        type: 'bar',
        data: monthlyBuckets.map((d) => d.expense),
        barMaxWidth: compact ? 22 : 32,
        itemStyle: { color: CHART_THEME.expense, borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
}

function renderMonthlyChart(expenses) {
  const el = document.getElementById('monthly-chart');
  if (!el || typeof echarts === 'undefined') return;

  monthlyChart = getOrInitChart(el);
  if (!monthlyChart) return;

  monthlyBuckets = aggregateMonthly(expenses);
  ensureSelectedMonth(monthlyBuckets);
  syncMonthPicker(monthlyBuckets);

  setChartOption(monthlyChart, buildMonthlyChartOption());

  monthlyChart.off('click');
  monthlyChart.on('click', (params) => {
    if (params.componentType !== 'series' || params.dataIndex == null) return;
    selectedMonthKey = monthlyBuckets[params.dataIndex].key;
    if (monthPicker) monthPicker.value = selectedMonthKey;
    onMonthSelected(cachedExpenses);
  });

  renderMonthlyDetail(expenses);
  resizeAllCharts();
}

function renderDailyChart(expenses) {
  const el = document.getElementById('daily-chart');
  if (!el || typeof echarts === 'undefined') return;

  const dailyTitle = document.getElementById('daily-chart-title');
  const monthKey = selectedMonthKey || toMonthKey(new Date());
  if (dailyTitle) {
    dailyTitle.textContent = `Daily income & expenses · ${formatMonthLabel(monthKey)}`;
  }

  dailyChart = getOrInitChart(el);
  if (!dailyChart) return;

  const data = aggregateDaily(expenses, monthKey);
  const { compact } = getChartLayout();
  const base = baseChartOption();
  const dayInterval = data.length > 20 ? (compact ? 3 : 1) : 0;

  setChartOption(dailyChart, {
    ...base,
    legend: {
      data: ['Income', 'Expense'],
      bottom: 0,
      textStyle: { color: CHART_THEME.text, fontSize: compact ? 10 : 12 }
    },
    grid: { ...base.grid, bottom: compact ? 64 : 56 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.label),
      axisLine: { lineStyle: { color: CHART_THEME.axis } },
      axisLabel: {
        color: CHART_THEME.text,
        interval: dayInterval,
        fontSize: compact ? 10 : 11
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: CHART_THEME.split } },
      axisLabel: {
        color: CHART_THEME.text,
        formatter: (v) => formatChartAxis(v)
      }
    },
    series: [
      {
        name: 'Income',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: data.length > 20 ? 4 : 6,
        data: data.map((d) => d.income),
        lineStyle: { width: 2.5, color: CHART_THEME.income },
        itemStyle: { color: CHART_THEME.income },
        areaStyle: { color: 'rgba(255, 204, 0, 0.1)' }
      },
      {
        name: 'Expense',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: data.length > 20 ? 4 : 6,
        data: data.map((d) => d.expense),
        lineStyle: { width: 2.5, color: CHART_THEME.expense },
        itemStyle: { color: CHART_THEME.expense },
        areaStyle: { color: 'rgba(255, 219, 77, 0.16)' }
      }
    ]
  });
  resizeAllCharts();
}

async function renderCharts(expenses) {
  cachedExpenses = expenses;
  await waitForChartContainers();
  renderOverallPieChart(expenses);
  renderMonthlyChart(expenses);
  renderDailyChart(expenses);
  setTimeout(resizeAllCharts, 100);
}

function handleChartResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeAllCharts();
    if (monthlyChart && monthlyBuckets.length) {
      updateMonthlyChartSeries();
    }
  }, 200);
}

window.addEventListener('resize', handleChartResize);
window.addEventListener('orientationchange', handleChartResize);

if (monthPicker) {
  monthPicker.addEventListener('change', () => {
    selectedMonthKey = monthPicker.value;
    onMonthSelected(cachedExpenses);
  });
}

async function parseApiResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

async function fetchExpenses() {
  const response = await authFetch('/api/expenses');
  return parseApiResponse(response, 'Failed to load transactions');
}

async function fetchSummary() {
  const response = await authFetch('/api/summary');
  return parseApiResponse(response, 'Failed to load summary');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getSelectedType() {
  return form.querySelector('input[name="type"]:checked')?.value || 'expense';
}

function populateCategories(type) {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  categorySelect.innerHTML = categories.map((c) => `<option value="${c}">${c}</option>`).join('');
}

function renderExpenses(expenses) {
  if (!expenses.length) {
    expenseList.innerHTML = '<div class="no-items">No transactions yet. Add your first income or expense.</div>';
    return;
  }

  expenseList.innerHTML = expenses
    .map((entry) => {
      const isIncome = (entry.type || 'expense') === 'income';
      const sign = isIncome ? '+' : '−';
      return `
      <div class="expense-item ${isIncome ? 'income-item' : 'expense-item-type'}">
        <div class="expense-details">
          <strong>${escapeHtml(entry.description)}</strong>
          <small>
            <span class="type-pill ${isIncome ? 'income' : 'expense'}">${isIncome ? 'Income' : 'Expense'}</span>
            ${escapeHtml(entry.date)} · ${escapeHtml(entry.category)}
          </small>
        </div>
        <div class="amount ${isIncome ? 'income' : 'expense'}">${sign}${formatCurrency(entry.amount)}</div>
        <button class="delete-btn" data-id="${entry.id}" aria-label="Delete transaction">×</button>
      </div>
    `;
    })
    .join('');

  expenseList.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      await authFetch(`/api/expenses/${id}`, { method: 'DELETE' });
      await load();
    });
  });
}

// #region agent log
function agentLog(location, message, data, hypothesisId) {
  fetch('http://127.0.0.1:7539/ingest/0ffc0f36-4315-4aea-9dc5-dbb7e8fb1a7c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '329b86' },
    body: JSON.stringify({ sessionId: '329b86', location, message, data, timestamp: Date.now(), hypothesisId })
  }).catch(() => {});
}
// #endregion

async function renderSummary() {
  const summary = await fetchSummary();
  const income = summary.income || 0;
  const expense = summary.expense || 0;
  const total = summary.total ?? income - expense;
  // #region agent log
  agentLog('app.js:renderSummary', 'summary rendered', { income, expense, total, runId: 'post-fix' }, 'D');
  // #endregion

  summaryIncome.textContent = formatCurrency(income);
  summaryExpense.textContent = formatCurrency(expense);
  summaryTotal.textContent = formatCurrency(total);
  summaryTotalTile.classList.toggle('negative', total < 0);
}

async function load() {
  const expenses = await fetchExpenses();
  cachedExpenses = expenses;
  const currentMonthKey = toMonthKey(new Date());
  const monthBucket = aggregateMonthly(expenses).find((b) => b.key === currentMonthKey);
  // #region agent log
  agentLog('app.js:load', 'data loaded', { expenseCount: expenses.length, currentMonthKey, monthBucket: monthBucket || null, runId: 'post-fix' }, 'B');
  // #endregion
  await renderSummary();
  renderExpenses(expenses);
  if (typeof echarts !== 'undefined') {
    await renderCharts(expenses);
  }
}

form.querySelectorAll('input[name="type"]').forEach((radio) => {
  radio.addEventListener('change', () => populateCategories(getSelectedType()));
});

populateCategories('expense');
dateInput.valueAsDate = new Date();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const payload = {
    description: data.get('description'),
    amount: data.get('amount'),
    category: data.get('category'),
    date: data.get('date'),
    type: data.get('type')
  };
  const postRes = await authFetch('/api/expenses', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  // #region agent log
  const saved = await parseApiResponse(postRes, 'Failed to save transaction');
  agentLog('app.js:form-submit', 'POST completed', { ok: true, status: postRes.status, payload, savedId: saved?.id, savedType: saved?.type, runId: 'post-fix' }, 'A');
  // #endregion
  form.reset();
  form.querySelector('input[name="type"][value="expense"]').checked = true;
  populateCategories('expense');
  dateInput.valueAsDate = new Date();
  document.querySelector('#description').focus();
  await load();
});

async function startApp() {
  try {
    await setupAuthUI();
  } catch (err) {
    console.error(err);
    return;
  }

  if (typeof echarts === 'undefined') {
    console.error('ECharts failed to load. Charts will not display.');
    document.querySelectorAll('.chart').forEach((el) => {
      el.innerHTML = '<p class="monthly-detail-empty">Charts unavailable. Check your internet connection.</p>';
    });
  }

  try {
    await load();
  } catch (err) {
    console.error(err);
    expenseList.innerHTML = `<div class="no-items error">${escapeHtml(err.message || 'Could not load dashboard. Try signing in again.')}</div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
