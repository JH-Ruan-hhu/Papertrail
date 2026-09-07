# 研迹 1.5.0

Windows 本地科研工作台，管理日程、待办、笔记、投稿和求职进度。当前版本关闭账号登录及云同步。

正式版沿用 v1.4.16 的应用身份、安装升级流程和数据路径，首次读取已有数据前备份 JSON、附件与数据位置指针。备份失败会停止启动，不写入原数据。

## 构建

运行 `npm test` 验证后，使用 `node scripts/package-release.cjs` 生成正式版，使用 `node scripts/package-beta.cjs` 生成独立预览安装包。正式版输出位于 outputs，预览包位于 outputs-beta。

## 本地数据

沿用已有 papertrail-storage.json 指定的位置。没有自定义位置时使用历史用户数据目录。升级备份位于用户数据目录的 upgrade-backups 下。
