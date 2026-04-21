# -*- coding: utf-8 -*-
"""DataSuite 批量运维常用 HTTP 路径速查（Mart SLA / 表绑定 / 脚本对齐）。

以下为 **浏览器同源接口**（需 DataSuite Cookie + CSRF），与 ``scheduler_mcp_server``
中 MCP 工具的对应关系见包内 README「DataSuite 批量运维接口」一节。
"""

from __future__ import annotations

# ── Scheduler 主站（前缀 ``https://datasuite.shopee.io``） ───────────────

SCHEDULER_API_V1 = "/scheduler/api/v1"

TASK_GET_LIST = f"{SCHEDULER_API_V1}/task/getList"
"""模糊 / 分页查任务：query ``taskName``, ``search=1``, ``idcRegion``, ``pageNo``, ``pageSize``。
请求头常用 ``x-datasuites-project-code``（如 ``spx_datamart``）。
MCP：``search_tasks``（keywords + query param）、``search_scheduler_tasks_fuzzy``。
"""

TASK_GET = f"{SCHEDULER_API_V1}/task/get"
"""任务详情（含 ``inputMarkers`` / 上下游 marker）。MCP：``get_task_info``。
"""

TASK_INSTANCE_GET_LIST = f"{SCHEDULER_API_V1}/taskInstance/getList"
"""实例列表。
- **按业务时间**：``bizTimeStart``, ``bizTimeOrder`` — MCP ``get_task_instances``
- **按更新时间**（对齐 SLA  sheet 脚本）：``updateTimeOrder``, ``taskCode``, ``pageNo``, ``pageSize``
  — MCP ``list_task_instances_by_update_time``
"""

MARKER_ALL_WITHOUT_TAG = (
    f"{SCHEDULER_API_V1}/data-dependency/v2/withoutTag/marker/all"
)
"""表/marker → 绑定任务列表；query ``type=web``, ``marker_name``, ``page_no``, ``page_size``,
``create_time_order``；可选 ``marker_scope``。
返回项中 ``task_id`` 即 Scheduler ``taskCode``。
MCP：``query_marker_task_bindings``。
"""

# ── SLA 子域（前缀 ``https://datasuite.shopee.io/sla``；非 prod 见 ``_sla_root``） ──

SLA_GET_ALL_STATUS = "/sla/sla/getAllStatus"
"""完整 SLA 配置：query ``slaCode``；响应含 ``slaTasks``, ``slaTimeDef``, ``slaPeriodType`` 等。
MCP：``get_sla_full_configuration``。
"""

SLA_INSTANCE_LIST_BY_TASK_INSTANCE = "/sla/slaInstance/getSlaInstanceListByTaskInstance"
"""某实例关联的 SLA 实例：query ``taskCode``, ``taskInstanceCode``。
MCP：``list_sla_bindings_for_task_instance``。
"""

SLA_INSTANCE_GET = "/sla/slaInstance/get"
"""告警短链闭环用（详见 ``mart_sla_instance_api``）。MCP：``fetch_mart_sla_instances_from_shortlink``。"""


# ── 其它（脚本曾用；未全部封装 MCP，避免误改生产） ─────────────────────────

SLA_GET_LIST = "/sla/sla/getList"
"""关键字搜索 SLA 定义（keyword / project），用于核对 ``slaCode`` 真实命名。"""

SLA_UPDATE = "/sla/sla/update"
"""更新 SLA（含任务清单）；变更生产配置须人工确认；当前未封装为 MCP write 工具。"""


_REFERENCE_MD = """## DataSuite Mart / SLA 相关接口一览

| 用途 | Method / Path（prod） | MCP 工具（若有） |
|------|-------------------------|------------------|
| 模糊查任务 | GET ``/scheduler/api/v1/task/getList`` | ``search_scheduler_tasks_fuzzy``, ``search_tasks`` |
| 任务详情（依赖 marker） | GET ``/scheduler/api/v1/task/get`` | ``get_task_info`` |
| 实例列表（业务时间窗口） | GET ``/scheduler/api/v1/taskInstance/getList`` | ``get_task_instances`` |
| 实例列表（更新时间分页） | GET ``/scheduler/api/v1/taskInstance/getList`` | ``list_task_instances_by_update_time`` |
| Marker→任务 | GET ``.../data-dependency/v2/withoutTag/marker/all`` | ``query_marker_task_bindings`` |
| SLA 全量配置 | GET ``/sla/sla/getAllStatus`` | ``get_sla_full_configuration`` |
| 实例→SLA 列表 | GET ``/sla/slaInstance/getSlaInstanceListByTaskInstance`` | ``list_sla_bindings_for_task_instance`` |
| SLA 告警详情（短链） | GET ``/sla/slaInstance/get`` | ``fetch_mart_sla_instances_from_shortlink`` |

**通用请求头**：``x-datasuites-project-code``（Mart 多为 ``spx_datamart``）；``x-csrf-token``（Cookie ``CSRF-TOKEN``）。
"""


def api_reference_markdown() -> str:
    """返回供 README / 文档粘贴的 Markdown 段落。"""
    return _REFERENCE_MD.strip()
