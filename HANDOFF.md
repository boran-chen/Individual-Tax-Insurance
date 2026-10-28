# 项目交接说明

本包用于把「保险代理人佣金个税申报数据管理系统」完整源码交付给另一位开发者，在另一台电脑上继续开发。

## 包里有什么

- `src/`：Next.js 页面、API、规则引擎、服务层、数据库与鉴权代码
- `scripts/`：初始化、种子数据、样例生成、冒烟测试、性能测试
- `tests/`：39 个自动化测试（PRD AC-01 ~ AC-14）
- `samples/`：可直接用于演示的源表、正确回传、篡改回传 Excel
- `README.md`：完整的业务规则、配置、测试与运行说明
- `保险代理人佣金个税申报数据管理系统_PRD_V1.0.pdf`：原始 PRD
- `package.json` / `package-lock.json`：锁定依赖版本
- `.claude/launch.json`：Claude Code 预览启动配置（可选）

## 包里刻意没有的东西

| 内容 | 原因 |
| --- | --- |
| `node_modules/` | 体积大且与本机架构相关，对方执行 `npm install` 安装 |
| `.next/`、`dist-scripts/`、`*.tsbuildinfo` | 构建产物，可重新生成 |
| `.env.local` | 含会话密钥、加密密钥；绝不能随代码外发 |
| `data/` | 本机演示数据库；含加密后的证照号码，且依赖本机密钥 |
| `storage/` | 本机上传/导出/回传文件 |
| `next-env.d.ts` | Next.js 自动生成 |

对方首次运行 `npm run setup` 会生成**新的** `.env.local`、空数据库并写入种子账号。不要直接把本机的 `.env.local` 发过去；如果确实需要连同演示数据一起迁移，必须通过安全渠道同时传递 `.env.local` 和 `data/app.db`，并确认接收方有权限保管这些密钥。

## 环境要求

- Node.js **24 或更高**（推荐 26；项目使用 Node 内置 `node:sqlite`，最低需要 22.5+，但实测版本为 26.4）
- npm 10+
- 可访问 npm registry（安装 Next.js、ExcelJS 等依赖）

## 另一台电脑上的启动步骤

```bash
npm install
npm run setup
npm run generate:sample
npm run dev
```

打开 http://localhost:3000 。

演示账号：

- 管理员：`admin` / `Admin@12345`
- 广东省负责人：`gd_user` / `Prov@12345`
- 深圳：`sz_user`；北京：`bj_user`；江苏：`js_user`；浙江：`zj_user`（密码均为 `Prov@12345`）

运行测试与构建：

```bash
npm test
npm run build
npm run smoke
npm run perf
```

## 代码地图与继续开发入口

| 模块 | 位置 |
| --- | --- |
| 业务规则（月份、金额、组织映射、四数据集、守恒、比对） | `src/lib/rules/v1/` |
| 回传比对与归集 | `src/lib/services/return-service.ts`、`src/lib/rules/v1/compare.ts` |
| 批次上传、处理、发布、版本 | `src/lib/services/batch-service.ts` |
| 四 Sheet 导出 | `src/lib/services/export-service.ts`、`src/lib/excel/writer.ts` |
| Excel 解析/表头识别 | `src/lib/excel/reader.ts` |
| 数据表结构 | `src/lib/db/schema.ts` |
| 种子账号/组织/省份映射 | `src/lib/db/seed.ts` |
| 字段别名默认值 | `src/lib/config/fields.ts` |
| 标准组织与省份别名 | `src/lib/config/organizations.ts` |
| 回传模板默认值 | `src/lib/config/return-template.ts` |
| 管理员页面 | `src/app/admin/` |
| 省负责人页面 | `src/app/province/` |
| API | `src/app/api/` |
| 任务 worker | `src/lib/services/job-worker.ts`、`src/instrumentation.ts` |

## 已做出的关键设计决策

1. **范围**：PRD V1.0 明确把回传/比对/归集列为不实现；本实现按需求方口头要求补齐为完整闭环。
2. **技术栈**：Next.js 15 + React 19 + TypeScript + Node 内置 SQLite，单进程部署；没有用 Prisma，避免引擎二进制下载。
3. **Excel**：ExcelJS 流式读写；四 Sheet 名称/顺序固定；证照号码文本格式；公式注入防护。
4. **鉴权**：自研 HMAC 会话 + scrypt 密码哈希；所有查询/导出在服务端按组织权限过滤。
5. **比对口径**：以「证件号码 + 姓名」为键，金额按分精确比较；同一人多条记录按金额多重集处理；差异不通过。
6. **归集**：以每组织**最新一次回传**为准；最新不通过的组织从当月归集剔除，不保留旧归集结果。
7. **配置化**：字段别名、表头行、省份映射、回传模板、上传限制均可配置；批次/导出/比对保存规则版本。

## 上线前必须处理

- **真实样表联调**：当前没有真实佣金总表，字段位置/别名/省份取值是默认值。拿到样表后：
  - 在「系统配置 → 字段别名」补充真实表头；
  - 在「省份映射」补齐真实省份写法；
  - 在「系统配置 → 回传模板」确认扣缴端导出模板；
  - 联调后冻结规则版本，并用真实数据回归 `npm test` 与 `npm run smoke`。
- **回传模板**：确认省负责人实际回传的是四 Sheet 中的“3劳动报酬收入”，还是扣缴端导出的申报结果；如是后者，调整 `sheetNames`/`columns`。
- **安全**：生产使用 HTTPS；默认生产 Cookie 带 Secure；密钥建议接 KMS/密钥管理；`.env.local` 不入库、不外发。
- **备份**：同时备份 `data/` 与 `storage/`；丢失 `APP_ENCRYPTION_KEY` 后已加密证照号码不可恢复。
- **依赖审计**：`npm install` 会提示 ExcelJS 传递依赖的安全告警；上线前按集团安全基线评估/升级并锁定版本。
- **建议后续功能**：规则版本变更后的“重新处理”入口、管理员多版本回传历史列表、部署监控与备份恢复脚本。

## 当前本机演示状态（不随包发送）

原电脑的 `data/app.db` 中保留了 `2026-07` 已发布批次：广东已通过并归集 44 条，其余 8 个组织未回传，便于继续在本机演示。该状态依赖原电脑的 `.env.local` 密钥，接收方无需也无法直接复用；按上面的启动步骤会得到干净的种子环境。
