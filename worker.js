/**
 * Cloudflare Workers 入口：阿里云多账号 ECS 控制台
 *
 * 路由：
 *   POST /login          登录（支持表单或 JSON）
 *   GET  /logout         退出登录
 *   GET  /check-auth     查询登录状态
 *   GET  /               控制台页面
 *   GET  /api/instances  全部实例状态（JSON）
 *   POST /api/action     开机 / 强制关机（节省停机模式），兼容旧版 POST /
 */

import { ConfigError, parseEcsConfigs, readPassword } from './src/config.js';
import { ActionError, loadAllInstances, runInstanceAction } from './src/service.js';
import { renderFatalPage, renderLoginPage } from './src/views/login.js';
import { renderDashboard } from './src/views/dashboard.js';

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=UTF-8',
  'Cache-Control': 'no-store',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function html(body, status = 200) {
  return new Response(body, { status, headers: HTML_HEADERS });
}

/** 兼容表单与 JSON 两种请求体 */
async function readPayload(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      const parsed = await request.json();
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  try {
    const formData = await request.formData();
    const payload = {};
    for (const [key, value] of formData.entries()) {
      payload[key] = typeof value === 'string' ? value : '';
    }
    return payload;
  } catch {
    return {};
  }
}

function buildAuthCookie(password) {
  return `auth=${encodeURIComponent(password)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
}

function isAuthenticated(request, password) {
  const cookies = request.headers.get('Cookie');
  if (!cookies) return false;

  const authCookie = cookies
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('auth='));
  if (!authCookie) return false;

  const raw = authCookie.slice('auth='.length);
  if (raw === password) return true;

  try {
    return decodeURIComponent(raw) === password;
  } catch {
    return false;
  }
}

async function handleLogin(request, password) {
  const payload = await readPayload(request);
  const input = payload.password === undefined || payload.password === null ? '' : String(payload.password);

  if (input !== '' && input === password) {
    return json({ success: true }, 200, { 'Set-Cookie': buildAuthCookie(password) });
  }
  return json({ success: false, error: '密码错误' }, 401);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/');

    try {
      const password = readPassword(env);
      // 未配置 PASSWORD 时一律拒绝访问
      if (!password) {
        return html(renderFatalPage({
          title: '访问已拒绝',
          message: '未配置访问密码 PASSWORD，控制台已锁定。',
          issues: [
            '请通过 wrangler secret put PASSWORD 或环境变量设置访问密码后重新部署。',
            '未设置密码时不会开放任何页面与接口。',
          ],
        }), 403);
      }

      if (url.pathname === '/login' && request.method === 'POST') {
        return handleLogin(request, password);
      }

      if (url.pathname === '/logout' && request.method === 'GET') {
        return new Response(null, {
          status: 302,
          headers: {
            Location: '/',
            'Set-Cookie': 'auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
            'Cache-Control': 'no-store',
          },
        });
      }

      if (url.pathname === '/check-auth' && request.method === 'GET') {
        return json({ authenticated: isAuthenticated(request, password) });
      }

      // --- 身份验证拦截 ---
      if (!isAuthenticated(request, password)) {
        if (isApi) return json({ ok: false, error: '未登录或登录已过期' }, 401);
        if (request.method === 'GET') return html(renderLoginPage());
        return json({ ok: false, error: '未登录或登录已过期' }, 401);
      }

      // --- 配置解析 ---
      let configs;
      try {
        configs = parseEcsConfigs(env);
      } catch (e) {
        if (e instanceof ConfigError) {
          if (isApi) return json({ ok: false, error: e.message, issues: e.issues }, 500);
          return html(renderFatalPage({ title: '环境变量配置错误', message: e.message, issues: e.issues }), 500);
        }
        throw e;
      }

      // --- 开机 / 关机（/api/action，兼容旧版 POST /） ---
      if (request.method === 'POST' && (url.pathname === '/api/action' || url.pathname === '/')) {
        const payload = await readPayload(request);
        try {
          const result = await runInstanceAction(configs, {
            index: payload.index === undefined || payload.index === '' ? 0 : payload.index,
            instanceId: payload.instanceId,
            action: payload.action,
          });
          return json({ ok: true, ...result });
        } catch (e) {
          if (e instanceof ActionError) return json({ ok: false, error: e.message }, 400);
          return json({ ok: false, error: e.message || '操作失败' }, 502);
        }
      }

      // --- 实例状态 JSON ---
      if (url.pathname === '/api/instances' && request.method === 'GET') {
        const data = await loadAllInstances(configs);
        return json({ ok: true, ...data });
      }

      // --- 控制台页面 ---
      if (url.pathname === '/' && request.method === 'GET') {
        const data = await loadAllInstances(configs);
        return html(renderDashboard({ data }));
      }

      if (isApi) return json({ ok: false, error: '接口不存在' }, 404);
      return new Response('404 Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
    } catch (e) {
      const message = (e && e.message) || '服务内部错误';
      if (isApi) return json({ ok: false, error: message }, 500);
      return html(renderFatalPage({ title: '服务内部错误', message }), 500);
    }
  },
};
