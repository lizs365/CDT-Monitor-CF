/**
 * 登录页 / 提示页
 */

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

const PAGE_STYLE = `
:root{--bg:#f4f7f9;--panel:#ffffff;--panel-soft:#fafafa;--text:#1f2329;--muted:#8c8c8c;--border:#e8ebef;--primary:#1890ff;--danger:#ff4d4f;--shadow:0 8px 24px rgba(0,0,0,.06);--radius:12px}
@media (prefers-color-scheme:dark){:root{--bg:#14171a;--panel:#1d2126;--panel-soft:#23282e;--text:#e6e8eb;--muted:#8b949e;--border:#30363d;--shadow:0 8px 24px rgba(0,0,0,.4)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.center{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:32px;width:100%;max-width:340px;text-align:center}
.card.wide{max-width:560px;text-align:left}
h2{margin:0 0 6px;font-size:19px}
.sub{margin:0;color:var(--muted);font-size:12px}
input{width:100%;padding:12px;margin:20px 0 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:14px;font-family:inherit}
input:focus{outline:none;border-color:var(--primary)}
button{width:100%;padding:12px;border:none;border-radius:8px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
button:disabled{background:#d9dde3;color:#8c8c8c;cursor:not-allowed}
.error{color:var(--danger);font-size:12px;min-height:18px;margin-bottom:8px}
ul{margin:14px 0 0;padding-left:20px;color:var(--muted);font-size:13px;line-height:1.9}
`;

export function renderLoginPage({ errorMessage = '' } = {}) {
  const error = escapeHtml(errorMessage);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AliECS 控制台登录</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="center">
  <form class="card" id="login-form" autocomplete="off">
    <h2>AliECS Control Panel</h2>
    <p class="sub">请输入访问密码以继续</p>
    <input type="password" id="password" placeholder="访问密码" autocomplete="current-password" required>
    <div class="error" id="login-error">${error}</div>
    <button type="submit" id="login-btn">登录</button>
  </form>
</div>
<script>
(function () {
  var form = document.getElementById('login-form');
  var input = document.getElementById('password');
  var errorEl = document.getElementById('login-error');
  var btn = document.getElementById('login-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var password = input.value;
    if (!password) {
      errorEl.textContent = '请输入访问密码';
      return;
    }
    btn.disabled = true;
    errorEl.textContent = '正在验证...';
    var body = new FormData();
    body.append('password', password);
    fetch('/login', { method: 'POST', body: body })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data && data.success) {
          location.reload();
          return;
        }
        errorEl.textContent = (data && data.error) || '密码错误';
        btn.disabled = false;
        input.select();
      })
      .catch(function (err) {
        errorEl.textContent = '请求失败：' + (err && err.message ? err.message : '未知错误');
        btn.disabled = false;
      });
  });

  input.focus();
})();
</script>
</body>
</html>`;
}

export function renderFatalPage({ title = '访问被拒绝', message = '', issues = [] } = {}) {
  const list = issues.length > 0
    ? `<ul>${issues.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="center">
  <div class="card wide">
    <h2>${escapeHtml(title)}</h2>
    <p class="sub">${escapeHtml(message)}</p>
    ${list}
  </div>
</div>
</body>
</html>`;
}
