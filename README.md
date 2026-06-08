# Quick Record

一个简单的每日活动记录网页应用，适合记录刷题心得、健身训练、阅读学习和生活事项。后端使用 Express，数据存储在 PostgreSQL，图片上传到本地 `uploads/` 目录并在数据库中保存访问地址。

## 功能

- 新增、编辑、删除每日记录
- 放大的 Markdown 编辑器，支持实时预览和常用格式插入
- 右侧记录栏可折叠，写长复盘时可以留出更多空间
- 独立文本对比工具，支持粘贴文本或上传 Markdown、DOC、DOCX、PDF，红绿标注增删内容
- 按时间、类型、关键词回溯记录
- 日历视图，按月查看每天记录数量并快速跳转到某一天
- 标签系统，支持用多个标签组织刷题、健身和复盘内容
- 统计面板，展示近 30 天记录数、活跃天、题目数和训练分钟
- 支持刷题数量、训练分钟、体重等结构化指标
- 支持多张图片上传，比如健身照、题解截图、训练记录截图
- PostgreSQL schema 可直接用于本地或云端数据库

## 本地运行

1. 安装依赖：

```bash
npm install
```

2. 准备 PostgreSQL。已有云数据库可以跳过这一步；本地开发可以用 Docker：

```bash
docker compose up -d
```

3. 准备环境变量：

```bash
cp .env.example .env
```

然后把 `.env` 里的 `DATABASE_URL` 改成你的 PostgreSQL 连接串。

4. 创建数据库表：

```bash
npm run db:migrate
```

5. 启动应用：

```bash
npm run dev
```

打开 `http://localhost:3000`。

## 云端 PostgreSQL

可以使用 Supabase、Neon、Railway、Render、AWS RDS 等服务。创建数据库后，把连接串填入 `.env`：

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

如果你的云数据库强制 SSL，连接串里通常需要 `sslmode=require`。部署到云服务器时也要设置同样的环境变量。

## 数据库结构

核心表在 [db/schema.sql](/Users/lebronjames/Documents/Codex/quickRecord/db/schema.sql)：

- `entries`：记录时间、类型、标题、正文、结构化指标
- `entry_images`：记录每条日志关联的图片地址和文件信息
- `tags`：标签字典
- `entry_tags`：记录和标签的多对多关联

## API

- `GET /api/entries`：查询记录，支持 `activityType`、`start`、`end`、`q`
- `GET /api/tags`：查询标签及使用次数
- `GET /api/stats`：查询近 30 天统计面板数据
- `GET /api/calendar`：查询某个月每天的记录聚合
- `POST /api/entries`：创建记录，使用 `multipart/form-data` 上传图片
- `GET /api/entries/:id`：查看单条记录
- `PUT /api/entries/:id`：更新记录
- `DELETE /api/entries/:id`：删除记录和关联图片
- `GET /api/health`：数据库健康检查
- `POST /api/extract-text`：从 Markdown、TXT、DOC、DOCX、PDF 文件中提取文本

## 下一步可扩展

- 登录鉴权，多用户隔离数据
- 图片迁移到 S3、Cloudflare R2、Supabase Storage
- 给刷题记录增加题目链接、难度、标签
- 给健身记录增加动作组数、重量、PR 标记
