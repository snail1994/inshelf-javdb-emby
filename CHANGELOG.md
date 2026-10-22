# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-10-23

### 新增

- JavDB 列表页、详情页显示 Emby 入库状态徽标。
- 一次拉取 Emby 全库，在本地建立番号索引，页面 O(1) 查询。
- 支持列表页、详情页分别开关；绿色徽标可跳转 Emby 影片详情。
- 设置面板：Emby 地址、API Key、测试连接、同步媒体库、清除缓存。
- 索引缓存与 TTL；低识别率、缓存过期时降级为「无法判断」，避免误报「未入库」。
- 可扩展适配器架构：新增网站只需加 site adapter，新增媒体服务器只需加 server adapter。
- 零依赖构建：`npm run build` 把 `src/` 拼成单个 `dist/inshelf-javdb-emby.user.js`。
- Node 内置测试：番号解析/匹配/状态机/Emby 分页/构建产物。
