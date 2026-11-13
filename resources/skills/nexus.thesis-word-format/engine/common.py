# -*- coding: utf-8 -*-
"""公共层：状态模型、哈希、检查项容器、阶段日志、测试用故障注入钩子。"""
import os, json, hashlib, datetime

PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED = "PASS", "FAIL", "BLOCKED", "REVIEW", "NOT_TESTED"
RANK = {PASS: 0, NOT_TESTED: 1, REVIEW: 2, FAIL: 3, BLOCKED: 4}


class Blocked(Exception):
    """前置条件不满足：必须停止，且不得进入写入阶段。"""


def worst(statuses):
    s = list(statuses)
    return max(s, key=lambda x: RANK[x]) if s else PASS


def stamp():
    return datetime.datetime.now().strftime("%Y%m%d_%H%M%S")


def iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def sha256_text(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def fault(name):
    """仅测试用：环境变量 NEXUS_THESIS_FAULT=<name> 时触发故障注入。生产环境不得设置。"""
    return os.environ.get("NEXUS_THESIS_FAULT", "") == name


class Checks:
    """有序检查项。critical=False 的 NOT_TESTED 不会拉低最终状态，但必须在报告中列出。"""

    def __init__(self):
        self.items = []

    def add(self, name, status, detail="", critical=True):
        self.items.append({"name": name, "status": status, "detail": detail, "critical": critical})
        return status

    def extend(self, other):
        self.items.extend(other.items if isinstance(other, Checks) else other)

    def final(self, review_items=()):
        st = []
        for c in self.items:
            if c["status"] == NOT_TESTED and not c["critical"]:
                continue
            st.append(c["status"])
        if review_items:
            st.append(REVIEW)
        return worst(st)


class RunLog:
    """阶段日志：timestamp / phase / action / target / before / after / result / error。
    path=None 时只保存在内存，不写任何文件（Audit Only 模式使用）。"""

    def __init__(self, path=None):
        self.path = path
        self.entries = []

    def add(self, phase, action, target="", before=None, after=None, result=PASS, error=None):
        e = {"timestamp": iso(), "phase": phase, "action": action, "target": target,
             "before": before, "after": after, "result": result, "error": error}
        self.entries.append(e)
        if self.path:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(e, ensure_ascii=False, default=str) + "\n")
        return e
