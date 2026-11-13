# -*- coding: utf-8 -*-
"""Nexus 论文排版 Skill 统一 CLI 入口。
支持命令：
  audit <docx_path>                 Phase 0: 只读审计模式，零写文件，诊断排版问题
  spec <spec_path>                  Phase 1: 解析官方规范文件并输出参数清单
  format <docx_path> [--spec <...>] 执行完整受控排版 SOP，输出已排版文件与排版报告
"""
import os, sys, argparse, json
try:
    from .common import PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED, Blocked
    from .ooxml_audit import Pkg, inventory, assign_roles, findings
    from .run_state import CheckpointManager
    from .spec_parse import load_specification
    from .com_format import ComThesisFormatter
    from .verify import ThesisVerifier
except ImportError:
    from common import PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED, Blocked
    from ooxml_audit import Pkg, inventory, assign_roles, findings
    from run_state import CheckpointManager
    from spec_parse import load_specification
    from com_format import ComThesisFormatter
    from verify import ThesisVerifier

def do_audit(docx_path):
    """只读审计模式：绝不写任何文件。"""
    docx_path = os.path.abspath(docx_path)
    if not os.path.exists(docx_path):
        print(f"[BLOCKED] 文件不存在: {docx_path}")
        return 1

    try:
        inv = inventory(docx_path)
        roles, extra = assign_roles(inv)
        issue_findings = findings(inv, roles, extra)
    except Blocked as e:
        print(f"[BLOCKED] 无法审计: {e}")
        return 2
    except Exception as e:
        print(f"[FAIL] 审计解析异常: {e}")
        return 3

    print(f"\n[论文排版审计]")
    print(f"文件：{os.path.basename(docx_path)}")
    print(f"结构：")
    print(f"  ✓ {inv.get('sections', 0)} Sections")
    print(f"  ✓ {inv.get('paragraphs', 0)} Paragraphs")
    print(f"  ✓ {inv.get('tables', 0)} Tables")
    print(f"  ✓ {inv.get('images', 0)} Images")
    print(f"  ✓ {inv.get('equations', 0)} Equations")
    if inv.get('ole_objects'):
        print(f"  ✓ {inv['ole_objects']} OLE/MathType Objects")
    print(f"  ✓ 文本 SHA-256: {inv.get('text_hash', '')[:16]}...")
    print(f"\n发现问题：")
    if issue_findings:
        for lvl, msg in issue_findings:
            icon = "🚫" if lvl == "BLOCKED" else ("⚠️" if lvl in ("WARN", "REVIEW") else "ℹ️")
            print(f"  {icon} {msg}")
    else:
        print("  ✓ 未发现显著格式冲突")

    print(f"\n> 审计完成：纯只读操作，未修改任何文件。\n")
    return 0

def do_format(docx_path, spec_path=None, template="MASTER_DOCTOR_CN"):
    """完整排版 SOP 执行。"""
    docx_path = os.path.abspath(docx_path)
    if not os.path.exists(docx_path):
        print(f"[BLOCKED] 文件不存在: {docx_path}")
        return 1

    print(f"=== Nexus 论文格式排版与独立验证系统 ===")
    print(f"[PHASE 0] 执行只读审计与结构体检...")
    try:
        before_inv = inventory(docx_path)
        roles, extra = assign_roles(before_inv)
        issue_findings = findings(before_inv, roles, extra)
    except Blocked as e:
        print(f"[BLOCKED] 预检阻断: {e}")
        return 2

    # 如果有硬性 BLOCKED（如受保护、开启修订、宏文档）
    blocked_items = [msg for lvl, msg in issue_findings if lvl == "BLOCKED"]
    if blocked_items:
        print(f"[BLOCKED] 文档处于受保护或含修订状态，必须人工处理后重试:")
        for b in blocked_items:
            print(f"  - {b}")
        return 2

    print(f"[PHASE 1] 加载排版规范与参数对齐...")
    spec = load_specification(spec_path, template)
    print(f"  规范来源: {spec.source_desc}")

    print(f"[PHASE 2] 创建原件备份并建立独立工作副本...")
    ckpt_mgr = CheckpointManager(docx_path)
    try:
        ckpt_mgr.init_backup_and_workspace()
    except Blocked as e:
        print(f"[BLOCKED] 备份失败: {e}")
        return 2

    print(f"  备份完成: {os.path.basename(ckpt_mgr.backup_file)}")

    print(f"[PHASE 3-6] 启动受控 Word COM 原生样式与版式排版...")
    formatter = ComThesisFormatter(ckpt_mgr.work_file, spec, ckpt_mgr)
    try:
        formatter.execute_all_phases(audit_info=before_inv)
    except Exception as e:
        print(f"[FAIL] 排版执行异常中断: {e}")
        ckpt_mgr.rollback()
        return 3

    print(f"[PHASE 7-8] Save -> Close -> Reopen 执行独立 OOXML 验证...")
    verifier = ThesisVerifier(docx_path, ckpt_mgr.work_file, before_inv, spec, ckpt_mgr.logger)
    status = verifier.run_independent_verification()

    print(f"  独立验证结果: {status}")
    if status == FAIL:
        print(f"[FAIL] 独立验证未通过！拒绝交付受损文件！已自动回滚。")
        ckpt_mgr.rollback()
        return 4

    print(f"[PHASE 9] 最终交付并生成审计报告...")
    try:
        output_file = ckpt_mgr.finalize_delivery()
        report_file, _ = verifier.generate_markdown_report(output_file, ckpt_mgr.backup_file)
    except Blocked as e:
        print(f"[BLOCKED] 交付阻断: {e}")
        ckpt_mgr.cleanup_workspace(preserve_on_failure=True, failed=True)
        return 2

    print(f"  交付文件: {output_file}")
    print(f"  排版报告: {report_file}")
    print(f"\n==========================================")
    print(f"排版成功完成！最终判定: {status}")
    print(f"==========================================\n")
    return 0

def main():
    parser = argparse.ArgumentParser(description="Nexus Academic Thesis Word Formatting Tool")
    subparsers = parser.add_subparsers(dest="command")

    audit_parser = subparsers.add_parser("audit", help="Phase 0: 只读审计")
    audit_parser.add_argument("file", help="待审计的 .docx 论文文件")

    format_parser = subparsers.add_parser("format", help="执行完整受控排版")
    format_parser.add_argument("file", help="待排版的 .docx 论文文件")
    format_parser.add_argument("--spec", help="官方论文规范文件 (PDF/DOCX)", default=None)
    format_parser.add_argument("--template", help="通用模板 (MASTER_DOCTOR_CN / BACHELOR_CN)", default="MASTER_DOCTOR_CN")

    args = parser.parse_args()
    if args.command == "audit":
        sys.exit(do_audit(args.file))
    elif args.command == "format":
        sys.exit(do_format(args.file, args.spec, args.template))
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
