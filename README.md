# 日历

人生需要记录.每当我们回首往日的历程,日历希望成为你最珍贵的痕迹

日历 是一个基于 Express + EJS + SQLite 的个人效率工具，包含：

- 日历视图任务管理
- 看板视图
- 每日笔记记录
- 节假日、节气、传统节日展示
- 天气城市与天气显示
- 笔记分析 API

项目适合单人自托管使用。服务端渲染，依赖少，部署简单。

## 功能概览

- `任务`：按月历查看、创建、完成、编辑、删除任务
- `子任务`：顶层任务支持子任务
- `看板`：以状态列管理任务
- `笔记`：按天保存，底层存储在 `data/notes/`
- `设置`：包含密码修改、API key 管理，以及管理员的天气/节假日设置
- `笔记分析 API`：给 Claude Code、Cloud、CodeChurn 等远端工具按天拉取日记内容

## 界面预览

![日历视图](docs/rili.png)

![设置页面](docs/setting.png)

![笔记编辑](docs/wriht.png)

## 技术栈

- Node.js
- Express
- EJS
- better-sqlite3
- express-session + SQLite session store

## 目录结构

```text
src/
  app.js                 应用入口
  config.js              环境变量配置
  db/
    database.js          SQLite 连接
    migrate.js           数据库迁移
    seed.js              初始化账号
  middleware/
    auth.js              登录鉴权
    notesApiAuth.js      笔记 API key 鉴权
  routes/
    auth.js
    todos.js
    notes.js
    kanban.js
    admin.js
    settings.js
    api.js
  services/
    noteService.js
    notesApiKeyService.js
    weatherService.js
    ...
  views/
    todos.ejs
    notes.ejs
    kanban.ejs
    settings.ejs

data/
  todu.db                主数据库
  sessions.sqlite        Session 数据库
  notes/                 笔记文件目录
  holidays/              节假日缓存
  locations/             城市列表缓存
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- 天气接口需要的 `WEATHER_API_BASE_URL`、`WEATHER_API_KEY` 或 `WEATHER_API_TOKEN`


### 3. 初始化数据库

```bash
npm run migrate
```

### 4. 初始化账号

```bash
npm run seed
```

初始化账号来自 `.env`：

- 用户名：`ADMIN_USERNAME`
- 密码：`ADMIN_PASSWORD`

### 5. 启动开发环境

```bash
npm run dev
```

### 6. 启动生产环境

```bash
npm start
```

默认访问地址：

```text
http://127.0.0.1:3000
```

## 初始化流程说明

### 全新安装

首次启动时按下面流程生成本地数据：

```bash
cp .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

各步骤作用：

- `cp .env.example .env`：创建本地私有配置文件
- `npm run migrate`：创建 `data/todu.db` 和缺失的数据表
- `npm run seed`：用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 初始化管理员账号
- `npm start`：启动应用


### 迁移已有数据


```text
data/todu.db
data/notes/
```

`data/todu.db` 保存用户、密码哈希、任务和天气状态；`data/notes/` 保存每日笔记。只迁移数据库不迁移 `data/notes/`，笔记会丢。

## 常用命令

```bash
npm run dev          # 开发模式
npm start            # 生产启动
npm run migrate      # 运行数据库迁移
npm run seed         # 初始化默认用户
npm run holiday:sync # 手动同步节假日数据
npm test             # 运行测试
```

## 数据存储说明

### SQLite 数据库

默认数据库路径：

```text
data/todu.db
```

Session 默认路径：

```text
data/sessions.sqlite
```

### 笔记文件

笔记不保存在数据库里，而是保存在文件系统中：

```text
data/notes/{userId}/{year}/{month}/{date}.md
```

例如：

```text
data/notes/1/2026/04/2026-04-16.md
```

这意味着部署时不能只备份数据库，还要保留 `data/notes/`。

## 主要环境变量

最常用的是这些：

```text
HOST
PORT
DB_PATH
NOTES_DATA_DIR
ADMIN_USERNAME
ADMIN_PASSWORD
SESSION_SECRET
SESSION_DB_DIR
NODE_ENV
SESSION_COOKIE_SECURE
HOLIDAY_SOURCE_PRIMARY
HOLIDAY_SOURCE_FALLBACK
WEATHER_API_BASE_URL
WEATHER_API_KEY
WEATHER_API_TOKEN
WEATHER_LOCATION_LIST_URL
WEATHER_LOCATION
WEATHER_LOCATION_NAME
```

说明：

- `DB_PATH`：主数据库路径，默认 `data/todu.db`
- `NOTES_DATA_DIR`：笔记文件目录，默认 `data/notes`
- `SESSION_DB_DIR`：session sqlite 所在目录
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：初始化管理员账号
- `SESSION_SECRET`：生产环境必须改，不能使用示例值
- `HOLIDAY_SOURCE_*`：节假日数据源地址
- `WEATHER_*`：天气接口和城市列表相关配置
- 天气图标位于 `public/icons/weather/`

完整模板见 `.env.example`。如果你没有特殊需要，线上保持默认数据路径即可。

## 数据库迁移说明

迁移入口：

```bash
npm run migrate
```

当前迁移策略是增量迁移：

- 只会创建缺失的表
- 只会补不存在的列
- 不会删表
- 不会清空旧数据
- 不会重建 `notes` 文件

### 线上更新时建议

虽然迁移本身是幂等和向后兼容的，但线上仍建议先备份：

```bash
cp data/todu.db data/todu.db.$(date +%F-%H%M%S).bak
cp -r data/notes data/notes.$(date +%F-%H%M%S).bak
```

然后再执行：

```bash
npm run migrate
```

## 部署说明

### PM2 启动

首次启动：

```bash
pm2 start src/app.js --name rili
```

普通重启：

```bash
pm2 restart rili
```

如果更新了环境变量：

```bash
pm2 restart rili --update-env
```

### 什么时候需要 `--update-env`

只有在环境变量发生变化时才需要，例如：

- 修改了 `NODE_ENV`
- 修改了 `PORT`
- 修改了 `DB_PATH`
- 修改了 `NOTES_DATA_DIR`
- 修改了天气接口配置

如果只是更新代码，不需要加。

### 推荐上线顺序

```bash
cd /path/to/rili
cp data/todu.db data/todu.db.$(date +%F-%H%M%S).bak
cp -r data/notes data/notes.$(date +%F-%H%M%S).bak
npm install
npm run migrate
pm2 restart rili
```

如果环境变量也改了：

```bash
pm2 restart rili --update-env
```

## 笔记分析 API 使用

这个项目提供一组只读的笔记分析 API，供远端 Cloud、CodeChurn、Claude Code 等工具按天拉取 `/notes` 中保存的内容。

### 1. 先生成 API Key

登录后打开：

```text
/settings
```

在“笔记分析 API”区域里可以看到：

- `API 基址`
- `分页接口`
- `按天接口`
- `API Key`

注意：

- `API Key` 和接口地址分开管理
- 重置 `API Key` 后，旧 key 立即失效
- 完整 key 只会在生成或重置时显示一次，之后页面只显示前缀

### 2. 鉴权方式

所有接口都使用：

```text
Authorization: Bearer <YOUR_API_KEY>
```

例如：

```bash
curl -H "Authorization: Bearer rili_npk_xxx" \
  "https://your-domain.com/api/v1/notes/days?page=1&pageSize=20"
```

### 3. 接口列表

#### 按天分页获取

```http
GET /api/v1/notes/days?page=1&pageSize=20
```

参数说明：

- `page`：页码，默认 `1`
- `pageSize`：每页条数，默认 `20`，最大 `100`

示例：

```bash
curl -H "Authorization: Bearer <YOUR_API_KEY>" \
  "https://your-domain.com/api/v1/notes/days?page=1&pageSize=20"
```

返回示例：

```json
{
  "items": [
    {
      "date": "2026-04-16",
      "updatedAt": "2026-04-16T05:10:23.000Z",
      "entryCount": 2,
      "combinedText": "[09:15] 第一条记录\n\n[18:45] 第二条记录",
      "entries": [
        {
          "index": 0,
          "time": "09:15",
          "recordedAt": "2026-04-16T09:15:00",
          "content": "第一条记录"
        },
        {
          "index": 1,
          "time": "18:45",
          "recordedAt": "2026-04-16T18:45:00",
          "content": "第二条记录"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasMore": false
  },
  "meta": {
    "generatedAt": "2026-04-16T05:11:00.000Z",
    "timezone": "Asia/Shanghai",
    "version": "v1"
  }
}
```

#### 获取某一天的完整记录

```http
GET /api/v1/notes/days/:date
```

示例：

```bash
curl -H "Authorization: Bearer <YOUR_API_KEY>" \
  "https://your-domain.com/api/v1/notes/days/2026-04-16"
```

返回示例：

```json
{
  "item": {
    "date": "2026-04-16",
    "updatedAt": "2026-04-16T05:10:23.000Z",
    "entryCount": 2,
    "combinedText": "[09:15] 第一条记录\n\n[18:45] 第二条记录",
    "entries": [
      {
        "index": 0,
        "time": "09:15",
        "recordedAt": "2026-04-16T09:15:00",
        "content": "第一条记录"
      },
      {
        "index": 1,
        "time": "18:45",
        "recordedAt": "2026-04-16T18:45:00",
        "content": "第二条记录"
      }
    ]
  },
  "meta": {
    "generatedAt": "2026-04-16T05:11:00.000Z",
    "timezone": "Asia/Shanghai",
    "version": "v1"
  }
}
```

### 4. 字段说明

按天对象字段：

- `date`：日期，格式 `YYYY-MM-DD`
- `updatedAt`：当天笔记文件最后更新时间
- `entryCount`：当天记录条数
- `combinedText`：当天所有文本合并后的内容，适合直接做摘要或分析
- `entries`：当天逐条记录

单条记录字段：

- `index`：当天第几条，从 `0` 开始
- `time`：记录时间，格式 `HH:mm`
- `recordedAt`：由 `date + time` 组合出的时间字符串；没有时间时为 `null`
- `content`：记录文本

分页字段：

- `page`
- `pageSize`
- `totalItems`
- `totalPages`
- `hasMore`

元信息字段：

- `generatedAt`
- `timezone`
- `version`

### 5. 给 Claude Code / Cloud 的使用建议

如果要让 Claude Code 或其他分析工具使用这组接口，建议把以下信息直接提供给它：

- `Base URL`
- `API Key`
- `分页接口`
- `按天接口`
- `Authorization` 用法
- 返回字段说明

可以直接给它这段提示：

```text
你可以通过这个接口读取我的日记数据：

Base URL: https://your-domain.com/api/v1
API Key: <YOUR_API_KEY>
分页接口: GET /notes/days?page=1&pageSize=20
单日接口: GET /notes/days/:date

请求头：
Authorization: Bearer <YOUR_API_KEY>

请先拉取最近 7 天的数据，再做总结。
```

### 6. 当前限制

- 这是只读接口，不支持外部写入、编辑、删除笔记
- 当前 API 不返回天气字段
- 笔记原始数据仍然保存在 `data/notes/` 文件目录中，不在数据库里

## 测试

运行：

```bash
npm test
```

当前已覆盖的核心链路：

- 登录后进入 `/settings`
- 生成和重置笔记 API key
- 旧 key 失效、新 key 生效
- 按天分页获取笔记
- 获取某一天完整笔记
- 用户之间的数据隔离

## 注意事项

- 生产环境一定要修改 `SESSION_SECRET`、`ADMIN_PASSWORD`，并使用自己的天气 API key/token
- 如果你迁移服务器，记得同时迁移 `data/todu.db` 和 `data/notes/`
- 笔记 API key 只在生成时显示完整值，建议生成后立即保存
