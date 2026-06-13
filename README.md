# EStore Opt Web

储能优化调度本地 Web 系统，参考 `power_plan_web` 的轻量架构实现，使用 Python 内置 HTTP 服务和原生 HTML/CSS/JS。

## 功能

- 输入配置：管理多个方案，每个方案保存一份 `params.xlsx`，可从附件模型定义工作簿创建、复制、导入、预览和编辑；计算参数以同一 Excel 文件里的“计算参数”表单维护，并同步生成 `compute_config.json` 兼容快照。
- 优化调度：选择方案后启动 `estore_opt_web/solve.py`，求解脚本读取该方案的 `compute_config.json` 开展计算，页面展示任务过程、日志、诊断指标和结果摘要。
- 方案校核：每个方案可单独维护 `dispatch_schedule.xlsx` 调度控制曲线文件，支持从优化结果生成新方案、编辑电芯电流/循环泵/电加热控制曲线，再以时域仿真方式校核电热边界、柴油实际消耗、新能源实际消纳/弃电和参考曲线偏差。
- 结果对比：自动索引优化调度结果和方案校核结果，支持多选后横向比较核心指标，并生成简单条形对比视图。
- 批量计算：选择多个方案，设置并行任务数，批量加入队列并统一跟踪状态。
- 用户注册/登录：本地 SQLite 用户库和会话 Cookie，首个注册账号自动成为管理员。
- 中英文切换：页面导航、首页、主要表单和认证页面支持中文/英文切换。

## 计算参数

每个方案目录下的 `params.xlsx` 都包含“计算参数”表单。在 Web 中进入“输入配置”，选中方案后点击和“系统定义”“配电模块”等同级的“计算参数”页签，即可修改并保存求解器、模式、步长、Gap、线性化分段等参数。

优化调度、方案校核和批量计算均默认读取对应方案 Excel 里的“计算参数”表单。保存时系统也会同步写出 `compute_config.json`，供命令行求解脚本通过 `--config-file` 使用。批量计算时，每个方案使用自身的计算参数。

每个方案的 `params.xlsx` 还包含“电芯电流限值”表单，用于按电芯温度设置最大充电电流和最大放电电流。表内电流为电芯级数值，求解器读取后按电池柜并联数折算为电池包电流，并与 PCS 电流上限共同约束优化过程中的 `I_bat`。

## 启动

```powershell
cd D:\codex\5.31代码_储能优化调度
python estore_opt_web\server.py --host 127.0.0.1 --port 8877
```

或双击/运行：

```bat
estore_opt_web\start_server.bat
```

浏览器访问：

```text
http://127.0.0.1:8877/
```

首次访问会跳转到登录页。先进入注册页创建账号，创建成功后会自动登录。

可选环境变量：

- `ESTORE_OPT_USER_DB`：指定用户 SQLite 数据库路径，默认 `estore_opt_web/estore_opt_users.sqlite3`。
- `ESTORE_OPT_SESSION_MAX_AGE`：会话有效期秒数，默认 604800。
- `ESTORE_OPT_LOCAL_AUTH_BYPASS=1`：本机开发调试时跳过登录，返回 `local-admin` 用户。

## 运行数据

- `estore_schemes/<方案名>/params.xlsx`：方案输入工作簿。
- `estore_schemes/<方案名>/compute_config.json`：由 Excel “计算参数”表单同步生成的兼容快照。
- `estore_schemes/<方案名>/opt_result.xlsx`：当前方案最近一次优化调度的统一结果文件，包含计算结果、统计信息和调度曲线。
- `estore_runs/<任务ID>/`：每次优化调度的参数快照、日志、诊断 JSON 和模型统计 JSON。
- `estore_schemes/<方案名>/dispatch_schedule.xlsx`：独立调度控制曲线文件，不写入 `params.xlsx`。
- `estore_verifications/<校核任务ID>/`：方案校核的逐时刻 CSV、完整 JSON 和 Markdown 摘要。
