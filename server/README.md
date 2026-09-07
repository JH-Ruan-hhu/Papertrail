# 研迹测试版服务

Node.js 22+、Fastify、PostgreSQL、Prisma。服务不随桌面安装包启动，也未部署到公共网络。

## 配置与启动

1. 创建独立 PostgreSQL 数据库；不要使用正式版或其他应用的数据库。
2. `npm ci --prefix server`，然后 `npm run db:generate --prefix server`。
3. 将 `.env.example` 中的配置注入服务进程环境。应用不会自动加载 `.env`；可使用 Node 的 `--env-file` 参数或部署平台的环境设置。
4. 在 server 目录运行 `npx prisma migrate deploy`，然后 `npm start`。
5. 默认仅监听 127.0.0.1:3100。通过 HTTPS 反向代理对外提供服务，再将 HTTPS 地址填入桌面端账号页。

`SESSION_SECRET` 为至少 32 字符的随机密钥。`DATABASE_URL` 为 PostgreSQL 连接串。所有密钥仅在服务端保存，不写入桌面包或源码。

验证码适配器使用 HTTPS POST 到 `CODE_DELIVERY_URL`，Authorization 为 Bearer `CODE_DELIVERY_TOKEN`，JSON 为 `{ target, purpose, code }`。适配器负责发送到邮箱或短信，不得记录验证码。未配置时接口明确返回未配置错误，不提供万能验证码。

微信需要开放平台的网站应用 AppID、AppSecret 和已登记回调地址 `/api/auth/wechat/callback`。桌面通过系统浏览器打开微信官方二维码页，服务端校验 state 并交换授权；桌面轮询使用独立秘密，一次领取会话。没有真实微信应用凭据时不能完成微信端到端验收。当前测试版不包含已有账号的微信绑定/解绑界面。

## 数据与安全

- 密码使用 Argon2id；验证码 HMAC 存储，5 分钟 TTL、最多 5 次尝试、单次使用。
- 登录/注册/验证码/重置有 IP 和账号限流。刷新令牌仅存哈希，轮换后重放会撤销令牌家族；重置密码撤销已有会话。
- 桌面刷新令牌由 Electron main 的 Windows safeStorage 加密，不进入 renderer 或 localStorage。
- PostgreSQL `auth_records` 按 kind/id 命名空间存用户、身份、会话、验证码、限流和审计；`workspace_records` 按 userId/entity/id 隔离。短事务使用 advisory lock 保证跨进程游标和 revision 一致。此实现串行化写事务，扩大部署前需按压测结果拆分锁和索引。
- 同步采用记录 revision、账号游标、删除标记和 mutationId 幂等回执，不覆盖整个 JSON。冲突返回当前云端版本。
- 当前同步业务记录和笔记图片；设备快捷键、系统设置及投稿追踪凭据保持本机。历史同 ID 不同内容不会静默覆盖。
- 服务不记录访问令牌、密码或验证码。运维方需自行配置数据库备份、保留期限、过期会话/验证码/限流记录清理及数据导出删除流程。
- 若使用反向代理，当前默认限流使用直接连接 IP；不要未经配置直接信任客户端 X-Forwarded-For。

## 验证

`npm test --prefix server` 验证注册、验证码限制、密码重置、刷新令牌重放、账号隔离、同步冲突与幂等、微信 state 和轮询秘密。根目录 `test/cloud-client.test.js` 覆盖双设备、离线编辑、冲突与账号缓存隔离。

本次另外使用临时 PostgreSQL 18 实例验证 Prisma migrate deploy、真实注册与令牌刷新、并发 revision 冲突和游标读取。该临时数据库不是部署服务。
