/**
 * 控制台页面：每行三个 ECS 卡片，支持响应式（≤1150px 两列，≤760px 单列）
 * 服务端注入初始数据，前端按同一份数据渲染卡片并支持增量刷新
 */

const PAGE_STYLE = `
:root{--bg:#f4f7f9;--panel:#ffffff;--panel-soft:#fafafa;--text:#1f2329;--muted:#8c8c8c;--border:#e8ebef;--primary:#1890ff;--success:#52c41a;--danger:#ff4d4f;--shadow:0 8px 24px rgba(0,0,0,.06);--radius:12px}
@media (prefers-color-scheme:dark){:root{--bg:#14171a;--panel:#1d2126;--panel-soft:#23282e;--text:#e6e8eb;--muted:#8b949e;--border:#30363d;--shadow:0 8px 24px rgba(0,0,0,.4)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1200px;margin:0 auto;padding:24px 20px 40px}
.topbar{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;margin-bottom:20px}
.brand h1{margin:0;font-size:20px;letter-spacing:.2px}
.brand p{margin:4px 0 0;font-size:12px;color:var(--muted)}
.stats{display:flex;flex-wrap:wrap;gap:8px}
.stat{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:6px 12px;font-size:12px;color:var(--muted);box-shadow:var(--shadow)}
.stat b{color:var(--text);font-size:13px}
.stat i{width:8px;height:8px;border-radius:50%;display:inline-block}
.top-actions{display:flex;align-items:center;gap:10px}
.btn{border:1px solid transparent;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;color:#fff;font-family:inherit;transition:filter .2s,opacity .2s}
.btn:hover:not(:disabled){filter:brightness(1.06)}
.btn:disabled{background:#d9dde3 !important;color:#8c8c8c !important;cursor:not-allowed}
.btn-refresh{background:var(--primary)}
.btn-start{background:var(--success)}
.btn-stop{background:var(--danger)}
.btn-ghost{border:1px solid var(--border);border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;color:var(--text);text-decoration:none;background:transparent}
.btn-ghost:hover{border-color:var(--primary);color:var(--primary)}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px;display:flex;flex-direction:column;gap:12px;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.1)}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.card-title{display:flex;align-items:center;gap:8px;min-width:0}
.badge-index{flex:none;background:var(--panel-soft);border:1px solid var(--border);color:var(--muted);font-size:11px;font-weight:700;border-radius:6px;padding:2px 6px}
.name{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;background:var(--panel-soft);border:1px solid var(--border);border-radius:999px;padding:4px 10px}
.status i{width:8px;height:8px;border-radius:50%;display:inline-block}
.card-sub{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.instance-id{cursor:pointer;background:var(--panel-soft);border:1px solid var(--border);border-radius:6px;padding:2px 6px;color:var(--text);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.instance-id:hover{border-color:var(--primary);color:var(--primary)}
.region{border:1px solid var(--border);border-radius:6px;padding:2px 6px}
.alert{background:rgba(255,77,79,.1);border:1px solid rgba(255,77,79,.35);color:var(--danger);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;word-break:break-all}
.meta{display:grid;gap:8px;margin:0;background:var(--panel-soft);border-radius:10px;padding:12px}
.meta .row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}
.meta dt{color:var(--muted)}
.meta dd{margin:0;font-weight:600;text-align:right;word-break:break-all}
.meta dd.traffic{color:var(--primary)}
.meta dd.traffic-error{color:var(--danger)}
.actions{display:flex;gap:10px;margin-top:auto}
.actions .btn{flex:1}
.card-msg{min-height:18px;font-size:12px;color:var(--muted);text-align:center;line-height:1.5}
.card-msg.error{color:var(--danger)}
.footer{margin-top:26px;text-align:center;font-size:12px;color:var(--muted);line-height:1.8}
@media (max-width:1150px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.wrap{padding:16px 12px 32px}.grid{grid-template-columns:minmax(0,1fr)}.topbar{align-items:stretch}.top-actions{width:100%}.top-actions .btn,.top-actions .btn-ghost{flex:1;text-align:center}}
`;

function toScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderDashboard({ data }) {
  const initialState = toScriptJson(data);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AliECS Control Panel</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="topbar">
    <div class="brand">
      <h1>AliECS Control Panel</h1>
      <p>多账号 ECS 控制台 · 数据更新于 <span id="updated-at">--</span></p>
    </div>
    <div class="stats" id="stats"></div>
    <div class="top-actions">
      <button type="button" class="btn btn-refresh" id="refresh-btn">刷新状态</button>
      <a class="btn-ghost" href="/logout">退出登录</a>
    </div>
  </header>
  <main class="grid" id="grid"></main>
  <div class="footer">
    <div>CDT 流量为账号维度当月累计公网出流量（每个账号免费额度 200GB/月，最终以阿里云控制台为准）</div>
    <div>强制关机使用节省停机模式，仅对按量付费实例生效</div>
  </div>
</div>
<script>
window.__INITIAL__ = ${initialState};
(function () {
  var state = window.__INITIAL__ || { instances: [], summary: {}, updatedAtText: '' };
  var busy = {};
  var messages = {};

  var grid = document.getElementById('grid');
  var statsEl = document.getElementById('stats');
  var updatedEl = document.getElementById('updated-at');
  var refreshBtn = document.getElementById('refresh-btn');

  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function findItem(index) {
    var list = state.instances || [];
    for (var i = 0; i < list.length; i += 1) {
      if (Number(list[i].index) === Number(index)) return list[i];
    }
    return null;
  }

  function cardHtml(item) {
    var parts = [];
    parts.push('<article class="card" id="card-' + item.index + '" data-index="' + item.index + '">');
    parts.push('<div class="card-head">');
    parts.push('<div class="card-title"><span class="badge-index">#' + (Number(item.index) + 1) + '</span><span class="name" title="' + esc(item.name) + '">' + esc(item.name) + '</span></div>');
    parts.push('<span class="status"><i style="background:' + esc(item.statusColor || '#8c8c8c') + '"></i>' + esc(item.statusLabel || '未知') + '</span>');
    parts.push('</div>');
    parts.push('<div class="card-sub">');
    parts.push('<code class="instance-id" data-copy="' + esc(item.instanceId) + '" title="点击复制实例 ID">' + esc(item.instanceId) + '</code>');
    parts.push('<span class="region">' + esc(item.regionId) + '</span>');
    parts.push('<span>' + esc(item.status || '') + '</span>');
    parts.push('</div>');
    if (item.error) parts.push('<div class="alert">' + esc(item.error) + '</div>');
    parts.push('<dl class="meta">');
    parts.push('<div class="row"><dt>规格</dt><dd>' + esc(item.specText) + '</dd></div>');
    parts.push('<div class="row"><dt>公网 IP</dt><dd>' + esc(item.publicIp || '无') + '</dd></div>');
    parts.push('<div class="row"><dt>CDT 流量</dt><dd class="' + (item.trafficGB === null || item.trafficGB === undefined ? 'traffic-error' : 'traffic') + '" title="' + esc(item.trafficError || '') + '">' + esc(item.trafficText) + '</dd></div>');
    parts.push('</dl>');
    parts.push('<div class="actions">');
    parts.push('<button type="button" class="btn btn-start" data-action="start" data-index="' + item.index + '"' + (item.canStart ? '' : ' disabled') + '>开机</button>');
    parts.push('<button type="button" class="btn btn-stop" data-action="stop" data-index="' + item.index + '"' + (item.canStop ? '' : ' disabled') + '>强制关机</button>');
    parts.push('</div>');
    parts.push('<div class="card-msg" id="msg-' + item.index + '"></div>');
    parts.push('</article>');
    return parts.join('');
  }

  function renderStats() {
    var summary = state.summary || {};
    var chips = [
      { label: '总计', value: summary.total || 0, color: '#8c8c8c' },
      { label: '运行中', value: summary.running || 0, color: '#52c41a' },
      { label: '已停止', value: summary.stopped || 0, color: '#f5222d' },
      { label: '异常', value: summary.error || 0, color: '#faad14' }
    ];
    var html = '';
    for (var i = 0; i < chips.length; i += 1) {
      html += '<span class="stat"><i style="background:' + chips[i].color + '"></i>' + chips[i].label + ' <b>' + chips[i].value + '</b></span>';
    }
    statsEl.innerHTML = html;
    updatedEl.textContent = state.updatedAtText || '--';
  }

  function applyBusy() {
    for (var key in busy) {
      var card = document.getElementById('card-' + key);
      if (!card) continue;
      var item = findItem(key);
      var buttons = card.querySelectorAll('button[data-action]');
      for (var i = 0; i < buttons.length; i += 1) {
        var action = buttons[i].getAttribute('data-action');
        var allowed = !busy[key] && !!item && (action === 'start' ? item.canStart : item.canStop);
        buttons[i].disabled = !allowed;
      }
    }
  }

  function applyMessages() {
    for (var key in messages) {
      var box = document.getElementById('msg-' + key);
      if (!box) continue;
      box.textContent = messages[key].text;
      box.className = messages[key].error ? 'card-msg error' : 'card-msg';
    }
  }

  function setBusy(index, value) {
    busy[index] = value;
    applyBusy();
  }

  function setMessage(index, text, isError) {
    messages[index] = { text: text || '', error: !!isError };
    applyMessages();
  }

  function renderAll() {
    var list = state.instances || [];
    if (list.length === 0) {
      grid.innerHTML = '<div class="card"><div class="alert">未获取到任何实例，请检查环境变量配置</div></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i += 1) html += cardHtml(list[i]);
    grid.innerHTML = html;
    applyBusy();
    applyMessages();
  }

  function updateCard(item) {
    var el = document.getElementById('card-' + item.index);
    if (!el) return;
    var holder = document.createElement('div');
    holder.innerHTML = cardHtml(item);
    el.parentNode.replaceChild(holder.firstChild, el);
    applyBusy();
    applyMessages();
  }

  function copyText(text, el) {
    if (!text) return;
    var restore = el.textContent;
    var done = function () {
      el.textContent = '已复制';
      setTimeout(function () { el.textContent = restore; }, 1200);
    };
    var fallback = function () {
      var area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch (err) { /* 忽略复制失败 */ }
      document.body.removeChild(area);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function refresh(targetIndex) {
    refreshBtn.disabled = true;
    if (targetIndex !== undefined) setMessage(targetIndex, '正在同步状态...', false);

    return fetch('/api/instances', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) { location.reload(); throw new Error('登录已过期'); }
        if (!res.ok) throw new Error('状态刷新失败（HTTP ' + res.status + '）');
        return res.json();
      })
      .then(function (data) {
        state = data;
        renderStats();
        if (targetIndex === undefined) {
          renderAll();
          return;
        }
        setBusy(targetIndex, false);
        var item = findItem(targetIndex);
        if (item) updateCard(item);
        setMessage(targetIndex, '状态已同步', false);
      })
      .catch(function (err) {
        var text = (err && err.message) || '状态刷新失败';
        if (targetIndex === undefined) alert(text);
        else { setBusy(targetIndex, false); setMessage(targetIndex, text, true); }
      })
      .then(function () { refreshBtn.disabled = false; });
  }

  function handleAction(index, action) {
    if (busy[index]) return;
    var item = findItem(index);
    if (!item) return;
    if (action === 'stop' && !confirm('确定对「' + (item.name || item.instanceId) + '」强制关机并进入节省停机模式？')) return;

    setBusy(index, true);
    setMessage(index, '正在发送指令...', false);

    var body = new FormData();
    body.append('action', action);
    body.append('index', String(index));
    body.append('instanceId', item.instanceId);

    fetch('/api/action', { method: 'POST', body: body })
      .then(function (res) {
        if (res.status === 401) { location.reload(); throw new Error('登录已过期'); }
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.ok) throw new Error((data && data.error) || ('操作失败（HTTP ' + res.status + '）'));
          return data;
        });
      })
      .then(function (data) {
        setMessage(index, (data.label || '指令') + '已发送，3 秒后自动同步状态...', false);
        setTimeout(function () { refresh(index); }, 3000);
      })
      .catch(function (err) {
        setBusy(index, false);
        setMessage(index, (err && err.message) || '请求失败', true);
      });
  }

  grid.addEventListener('click', function (event) {
    var target = event.target;
    var button = target.closest ? target.closest('button[data-action]') : null;
    if (button) {
      handleAction(Number(button.getAttribute('data-index')), button.getAttribute('data-action'));
      return;
    }
    var code = target.closest ? target.closest('.instance-id') : null;
    if (code) copyText(code.getAttribute('data-copy'), code);
  });

  refreshBtn.addEventListener('click', function () { refresh(); });

  renderStats();
  renderAll();
})();
</script>
</body>
</html>`;
}
