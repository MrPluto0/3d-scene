# DEPLOY NOTE（给下一个会话的交接）

任务：把本目录（~/Projects/3d-scene/wonton-stall）部署到 Vercel。

状态：
- Vercel MCP 已 OAuth 授权（hermes mcp install vercel，238 工具，本会话应已加载）
- GitHub 仓库已就绪：MrPluto0/wonton-stall（public，main 分支）
- 纯静态站，无构建步骤：根目录 index.html + viewer.html + vendor/（three.js 本地副本）
- 用户沟通渠道：微信（他在外面，用手机；能复制粘贴 URL，但开不了电脑网页）

要做的事：
1. 用 Vercel MCP 工具创建项目并部署本目录（framework=其他/静态，root directory=仓库根）
2. 部署完把线上 URL 发给用户（微信）
3. 用户目标：作品集展示，以后每次改完直接说"部署一下"就要能推

注意：不要装 vercel CLI，不要让用户开 Vercel 网页（他点不了）。全走 MCP 工具。
