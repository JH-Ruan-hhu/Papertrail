# 研迹测试版 1.5.0-beta.2

基于 v1.4.16 重构的 Windows x64 测试版。beta.2 重做我的投递：统一搜索卡、取消待投递列、展开式岗位卡、岗位类型下拉、时间编辑与进度条表格，以及右侧五角星置顶和方块标签。全局界面及即写即走统一采用蓝白风格。采用统一蓝白界面，保留日程、待办、笔记、打卡和投稿记录，新增求职总览、投递台历、看板和账号同步。

## 与正式版共存

- 应用名：研迹测试版；可执行文件：Yanji-Beta.exe。
- 安装位置：`%LOCALAPPDATA%\Programs\Yanji-Beta`。
- 应用标识：`io.papertrail.desktop.beta`；数据目录：`%APPDATA%\yanji-beta`。
- 测试版独立快捷方式、托盘标识、卸载项，不参与正式版自动更新。
- 即写即走默认快捷键：Ctrl+Alt+Space。
- 不自动读取正式版数据。账号页的“导入旧版数据副本”只读取所选 JSON 和关联附件，复制到空的测试工作区。

## 使用

安装后可选择“暂时在本机使用”。邮箱、短信、微信登录与云同步需要部署配套服务，并在账号页配置服务器地址；安装包不包含公共服务器或第三方凭据。微信登录通过浏览器中的微信官方二维码页面完成。

登录后切换到独立账号缓存；退出登录回到本机测试工作区。首次迁移需要点击“备份并同步本机测试数据”并确认。冲突保留双方内容，由用户选择本机或云端版本。投稿追踪凭据不上传，其他设备需要重新配置凭据。

## 开发与验证

```powershell
npm ci
npm ci --prefix server
npm run test:server
npm test
npm run brand:generate
npm run smoke:v15
node scripts/smoke-main-v15.js
npm run dist
npm run verify:package -- outputs-beta
node scripts/packaged-smoke.js outputs-beta
```

首次安装服务端依赖后运行 `npm run db:generate --prefix server`。Windows 中文路径下若打包工具失败，请使用 ASCII 临时目录构建。服务器运行说明见 [server/README.md](server/README.md)。旧版本说明保留在 [CHANGELOG-legacy.md](CHANGELOG-legacy.md)。

图标源文件为 `build/icon.svg`；生成脚本同步输出窗口、托盘与安装程序使用的 PNG/ICO。应用内品牌图标使用同源 `src/renderer/brand.svg`。
