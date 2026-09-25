# AliECS Control Panel（Cloudflare Workers）

基于 Cloudflare Workers 的阿里云多账号 ECS 控制台，纯 REST API 调用（不依赖阿里云 SDK）。

功能：

- 多账号 / 多实例：每行显示三个 ECS 卡片，响应式布局（≤1150px 两列，≤760px 单列）
- 查询实例状态、规格、公网 IP，支持一键复制实例 ID
- 开机、强制关机（节省停机模式 `StoppedMode=StopCharging`）
- CDT 当月累计公网流量展示（账号维度）
- 单个实例查询失败不影响其他卡片渲染
- 密码登录（Cookie 鉴权），支持退出登录

## 目录结构

```
.
├── worker.js              # 入口：路由分发、鉴权、配置校验
├── src/
│   ├── config.js          # 解析 ALIBABA_CLOUD_* / INSTANCE_ID / REGION_ID 多组配置
│   ├── aliyun.js          # 阿里云 OpenAPI 客户端（V1.0 HMAC-SHA1 签名）
│   ├── service.js         # 业务层：并发聚合实例状态与 CDT 流量、开关机
│   └── views/
│       ├── login.js       # 登录页 / 提示页
│       └── dashboard.js   # 控制台页（卡片网格 + 增量刷新）
├── wrangler.toml
├── package.json
├── .dev.vars.example      # 本地调试变量示例
└── .gitignore
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 访问密钥 ID，多组用 `;` 分隔 |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 访问密钥 Secret，多组用 `;` 分隔 |
| `INSTANCE_ID` | ECS 实例 ID，多组用 `;` 分隔 |
| `REGION_ID` | ECS 所在地域，多组用 `;` 分隔，可省略或留空（默认 `cn-hangzhou`） |
| `PASSWORD` | 控制台访问密码 |

配置规则：

- 各变量以英文分号 `;` 分隔（兼容全角 `；`），**序号严格一一对应**，即第 N 个实例使用第 N 个 AccessKey / Secret / Region。
- 一个账号对应一台 ECS：同一账号（同一对 AK）下的多台实例会共用一次 CDT 流量请求。
- `REGION_ID` 项数可以少于其他变量，缺少或留空的位置使用默认值 `cn-hangzhou`。
- 其他三个变量项数必须完全一致，否则页面会直接显示配置错误明细，不会发起任何 API 调用。
- **未配置 `PASSWORD` 时一律拒绝访问**（所有页面和接口返回 403）。

示例（3 组配置）：

```
ALIBABA_CLOUD_ACCESS_KEY_ID     = "LTAI5tAccountA0;LTAI5tAccountB0;LTAI5tAccountC0"
ALIBABA_CLOUD_ACCESS_KEY_SECRET = "secretAccountA;secretAccountB;secretAccountC"
INSTANCE_ID                     = "i-aaaaaaa1;i-bbbbbbb2;i-ccccccc3"
REGION_ID                       = "cn-hangzhou;cn-shenzhen;cn-beijing"
PASSWORD                        = "change-me"
```

## 部署

```bash
npm install

# 写入敏感变量（AccessKey、密码建议使用 secret）
npx wrangler secret put ALIBABA_CLOUD_ACCESS_KEY_ID
npx wrangler secret put ALIBABA_CLOUD_ACCESS_KEY_SECRET
npx wrangler secret put INSTANCE_ID
npx wrangler secret put REGION_ID
npx wrangler secret put PASSWORD

# 预览与部署
npm run dev      # 本地开发（读取 .dev.vars）
npm run deploy   # 发布到 Cloudflare
```

本地开发前执行 `cp .dev.vars.example .dev.vars` 并填写真实值。

Cloudflare 控制台部署时，在 Worker 的 `Settings → Variables and Secrets` 中配置上述同名变量即可，多组配置同样使用 `;` 分隔。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/login` | 登录，请求体支持表单或 JSON（`password`） |
| GET | `/logout` | 退出登录并清除 Cookie |
| GET | `/check-auth` | 返回 `{ authenticated }` |
| GET | `/` | 控制台页面（未登录返回登录页） |
| GET | `/api/instances` | 全部实例状态与流量（JSON） |
| POST | `/api/action` | 开机 / 关机，参数：`action=start\|stop`、`index`、`instanceId` |

`POST /` 保留为旧版兼容入口，等价于操作第 1 个实例。

## 注意事项

- CDT 流量为**账号维度**当月累计公网出流量，接口失败时卡片显示「获取失败」，不影响状态展示；成功结果在 Worker 实例内缓存 60 秒。
- 每个账号每月 200GB 免费额度，页面展示值仅供参考，最终以阿里云控制台为准。
- 节省停机模式（`StopCharging`）仅对按量付费实例生效。
- OpenAPI 使用 V1.0 HMAC-SHA1 签名（与 old.js 一致）；签名实现基于 Web Crypto，无需 SDK。
