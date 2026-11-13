# -*- coding: utf-8 -*-
"""阶段执行与 Checkpoint 状态管理器。
负责：原文件只读备份、工作副本创建、Checkpoint 状态落地、原子替换与回滚、审计日志。"""
import os, sys, shutil, json, time
try:
    from .common import (
        PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED, Blocked,
        stamp, iso, sha256_file, sha256_text, fault, Checks, RunLog
    )
except ImportError:
    from common import (
        PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED, Blocked,
        stamp, iso, sha256_file, sha256_text, fault, Checks, RunLog
    )

class CheckpointManager:
    """管理格式化排版的生命周期与 Checkpoint。
    保证：
    1. 原文件绝不修改（创建 [备份]_原文件名_YYYYMMDD_HHMMSS.docx）；
    2. 操作仅在工作副本上进行；
    3. 每个 Checkpoint 保留快照，失败时自动回滚到最近安全 Checkpoint；
    4. 最终成功后生成 [已排版]_原文件名.docx。
    """

    def __init__(self, input_file, work_dir=None, dry_run=False):
        self.input_file = os.path.abspath(input_file)
        if not os.path.exists(self.input_file):
            raise Blocked(f"输入文件不存在: {self.input_file}")

        self.input_dir = os.path.dirname(self.input_file)
        self.base_name = os.path.splitext(os.path.basename(self.input_file))[0]
        self.ext = os.path.splitext(self.input_file)[1].lower()
        if self.ext != ".docx":
            raise Blocked(f"仅支持 .docx 文件，不支持: {self.ext}")

        self.dry_run = dry_run
        self.work_dir = work_dir or os.path.join(self.input_dir, f".thesis_format_{stamp()}")
        self.log_file = None if dry_run else os.path.join(self.work_dir, "run_log.jsonl")
        self.logger = RunLog(self.log_file)
        self.checks = Checks()

        self.orig_sha256 = sha256_file(self.input_file)
        self.backup_file = None
        self.work_file = None
        self.output_file = os.path.join(self.input_dir, f"[已排版]_{self.base_name}.docx")
        self.checkpoints = {}
        self.current_checkpoint = -1

    def init_backup_and_workspace(self):
        """执行 Phase 2 前置：创建备份与独立工作区。"""
        if self.dry_run:
            self.checks.add("备份与工作区初始化", PASS, "只读模式，跳过备份与工作区创建")
            return

        if not os.path.exists(self.work_dir):
            os.makedirs(self.work_dir, exist_ok=True)

        # 1. 备份文件命名规则: [备份]_原文件名_YYYYMMDD_HHMMSS.docx
        ts = stamp()
        self.backup_file = os.path.join(self.input_dir, f"[备份]_{self.base_name}_{ts}.docx")

        # 故障注入测试
        if fault("BACKUP_FAIL"):
            raise Blocked("故障注入: 模拟备份创建失败")

        try:
            shutil.copy2(self.input_file, self.backup_file)
        except Exception as e:
            self.logger.add("PHASE_2", "BACKUP", target=self.backup_file, result=BLOCKED, error=str(e))
            raise Blocked(f"备份文件创建失败: {e}")

        # 2. 校验备份文件存在与 SHA-256 一致性
        if not os.path.exists(self.backup_file):
            raise Blocked("备份文件未能正确写入磁盘")

        bk_sha = sha256_file(self.backup_file)
        if bk_sha != self.orig_sha256:
            raise Blocked("备份文件 SHA-256 与原文件不一致，备份损坏")

        # 3. 创建工作副本
        self.work_file = os.path.join(self.work_dir, f"work_{self.base_name}.docx")
        shutil.copy2(self.backup_file, self.work_file)

        self.logger.add("PHASE_2", "BACKUP_VERIFIED", target=self.backup_file,
                        before=self.orig_sha256, after=bk_sha, result=PASS)
        self.checks.add("原件备份与完整性", PASS, f"备份创建成功: {os.path.basename(self.backup_file)}")

        self.save_checkpoint(0, "Backup completed & Baseline established")

    def save_checkpoint(self, step_num, description):
        """保存当前阶段的 Checkpoint 快照。"""
        if self.dry_run or not self.work_file or not os.path.exists(self.work_file):
            return
        ckpt_path = os.path.join(self.work_dir, f"checkpoint_{step_num}.docx")
        shutil.copy2(self.work_file, ckpt_path)
        self.checkpoints[step_num] = {
            "step": step_num,
            "desc": description,
            "path": ckpt_path,
            "sha256": sha256_file(ckpt_path),
            "time": iso()
        }
        self.current_checkpoint = step_num
        self.logger.add(f"CHECKPOINT_{step_num}", "SAVE", target=ckpt_path,
                        after=self.checkpoints[step_num]["sha256"], result=PASS)

    def rollback(self, target_step=None):
        """回滚到上一个有效 Checkpoint。"""
        if self.dry_run or not self.checkpoints:
            return False
        if target_step is None:
            steps = sorted([s for s in self.checkpoints.keys() if s < self.current_checkpoint])
            target_step = steps[-1] if steps else 0

        ckpt = self.checkpoints.get(target_step)
        if not ckpt or not os.path.exists(ckpt["path"]):
            return False

        shutil.copy2(ckpt["path"], self.work_file)
        self.current_checkpoint = target_step
        self.logger.add("ROLLBACK", f"REVERT_TO_CP_{target_step}", target=self.work_file,
                        after=ckpt["sha256"], result=REVIEW)
        return True

    def finalize_delivery(self):
        """最终交付：将校验合格的工作文件安全复制为交付文件。原文件绝对保持不变。"""
        if self.dry_run:
            return None

        # 最终验证原文件 SHA-256 是否被污染
        current_orig_sha = sha256_file(self.input_file)
        if current_orig_sha != self.orig_sha256:
            raise Blocked("FATAL: 原始文件内容已被意外篡改！立即阻断！")

        # 故障注入测试
        if fault("SAVE_FAIL"):
            raise Blocked("故障注入: 模拟保存交付文件失败")

        # 写入 [已排版]_原文件名.docx
        temp_out = os.path.join(self.work_dir, f"final_{self.base_name}.docx")
        shutil.copy2(self.work_file, temp_out)
        shutil.copy2(temp_out, self.output_file)

        self.logger.add("FINALIZE", "DELIVER", target=self.output_file,
                        after=sha256_file(self.output_file), result=PASS)
        return self.output_file

    def cleanup_workspace(self, preserve_on_failure=True, failed=False):
        """清理临时工作目录。若失败且设置保护，则保留供排查。"""
        if self.dry_run:
            return
        if failed and preserve_on_failure:
            return
        try:
            if os.path.exists(self.work_dir):
                shutil.rmtree(self.work_dir, ignore_errors=True)
        except Exception:
            pass
