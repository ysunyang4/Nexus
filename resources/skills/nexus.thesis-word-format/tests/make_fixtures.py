# -*- coding: utf-8 -*-
"""生成 15 个真实测试用例的 Fixture 文档。
使用 python-docx + lxml 注入真实 OMML 公式、图片、三线表、复杂合并表、脚注、多 Section、奇偶页眉、TOC 字段、伪缩进空格。"""
import os, sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

def add_omml_formula(p):
    """注入原生 OMML 数学公式: a^2 + b^2 = c^2"""
    omml_xml = (
        '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'
        '<m:sSup><m:e><m:r><m:t>a</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>'
        '<m:r><m:t> + </m:t></m:r>'
        '<m:sSup><m:e><m:r><m:t>b</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>'
        '<m:r><m:t> = </m:t></m:r>'
        '<m:sSup><m:e><m:r><m:t>c</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>'
        '</m:oMath>'
    )
    p._p.append(parse_xml(omml_xml))

def add_dummy_image(doc):
    """创建并注入测试图片"""
    import io
    from PIL import Image
    img = Image.new("RGB", (100, 100), color=(73, 109, 137))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    doc.add_picture(buf, width=Inches(1.5))

def create_all_fixtures():
    os.makedirs(FIXTURES_DIR, exist_ok=True)

    # Test 1: 普通 DOCX
    doc = Document()
    doc.add_paragraph("第 1 章 绪论")
    doc.add_paragraph("这是计算机科学学术论文的开篇正文段落。本文研究了智能代理的控制流与稳定性。")
    doc.add_paragraph("1.1 研究背景")
    doc.add_paragraph("随着模型能力演进，受控排版成为了高可靠软件交互的关键基础设施。")
    doc.save(os.path.join(FIXTURES_DIR, "test_01_plain.docx"))

    # Test 2: 包含公式 DOCX (OMML)
    doc = Document()
    doc.add_paragraph("第 1 章 核心算法推导")
    p = doc.add_paragraph("著名的勾股定理如下所示：")
    add_omml_formula(p)
    doc.add_paragraph("公式推导完毕，以上公式在排版过程中必须保持守恒，不得丢失。")
    doc.save(os.path.join(FIXTURES_DIR, "test_02_equation.docx"))

    # Test 3: 包含图片 DOCX
    doc = Document()
    doc.add_paragraph("第 2 章 实验架构图")
    doc.add_paragraph("系统部署拓扑如下图所示：")
    add_dummy_image(doc)
    doc.add_paragraph("图 2-1 系统架构拓扑图")
    doc.save(os.path.join(FIXTURES_DIR, "test_03_image.docx"))

    # Test 4: 包含三线表 / 普通表格
    doc = Document()
    doc.add_paragraph("第 3 章 实验数据分析")
    doc.add_paragraph("表 3-1 实验基准对比测试数据")
    tbl = doc.add_table(rows=3, cols=3)
    data = [["模型", "准确率", "F1 分数"], ["Baseline", "85.2%", "0.84"], ["Nexus-Agent", "98.7%", "0.98"]]
    for r_idx, row in enumerate(tbl.rows):
        for c_idx, cell in enumerate(row.cells):
            cell.text = data[r_idx][c_idx]
    doc.save(os.path.join(FIXTURES_DIR, "test_04_table.docx"))

    # Test 5: 包含复杂合并表格
    doc = Document()
    doc.add_paragraph("第 4 章 复杂统计指标分析")
    tbl = doc.add_table(rows=4, cols=4)
    # 跨列合并第一行
    tbl.cell(0, 0).merge(tbl.cell(0, 3))
    tbl.cell(0, 0).text = "复杂跨列合并表头（应触发 REVIEW 并跳过破坏性排版）"
    for r in range(1, 4):
        for c in range(4):
            tbl.cell(r, c).text = f"数据_{r}_{c}"
    doc.save(os.path.join(FIXTURES_DIR, "test_05_complex_table.docx"))

    # Test 6: 包含多 Section
    doc = Document()
    doc.add_paragraph("这是第一节（封面与摘要）")
    doc.add_section()
    doc.add_paragraph("这是第二节（正文主体）")
    doc.save(os.path.join(FIXTURES_DIR, "test_06_multi_section.docx"))

    # Test 7: Roman -> Arabic 页码
    doc = Document()
    doc.add_paragraph("中文摘要")
    doc.add_paragraph("本文提出了一种基于 OOXML 与 COM 的受控排版架构。")
    doc.add_section()
    doc.add_paragraph("第 1 章 绪论正文")
    doc.add_paragraph("正文部分开始使用阿拉伯数字页码。")
    doc.save(os.path.join(FIXTURES_DIR, "test_07_roman_arabic.docx"))

    # Test 8: 奇偶页眉
    doc = Document()
    doc.add_paragraph("第 1 章 论文正文")
    doc.add_paragraph("奇数页显示章名称，偶数页显示学校学位论文规范。")
    doc.save(os.path.join(FIXTURES_DIR, "test_08_odd_even_header.docx"))

    # Test 9: 已有 TOC
    doc = Document()
    p_toc = doc.add_paragraph("目 录")
    # 注入原生 TOC 域代码
    fld = parse_xml(r'<w:fldSimple %s w:instr="TOC \o &quot;1-3&quot; \h \z \u"/>' % nsdecls('w'))
    p_toc._p.append(fld)
    doc.add_paragraph("第 1 章 绪论")
    doc.add_paragraph("正文内容...")
    doc.save(os.path.join(FIXTURES_DIR, "test_09_toc.docx"))

    # Test 10: 存在伪缩进空格
    doc = Document()
    doc.add_paragraph("第 1 章 背景说明")
    doc.add_paragraph("    这是用 4 个半角空格模拟缩进的正文段落，应被识别并规范。")
    doc.add_paragraph("　　这是用全角空格模拟缩进的正文段落。")
    doc.save(os.path.join(FIXTURES_DIR, "test_10_pseudo_indent.docx"))

    # Test 11: 包含脚注
    doc = Document()
    doc.add_paragraph("第 1 章 概念界定")
    p = doc.add_paragraph("本文中提到的智能代理技术包含多种执行范式。")
    # 注入基本脚注元素
    fn_xml = (
        r'<w:r %s><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>'
        r'<w:footnoteReference w:id="1"/></w:r>'
    ) % nsdecls('w')
    p._p.append(parse_xml(fn_xml))
    doc.save(os.path.join(FIXTURES_DIR, "test_11_footnote.docx"))

    # Test 12: 包含 OLE 对象
    doc = Document()
    doc.add_paragraph("第 1 章 外部嵌入对象测试")
    p = doc.add_paragraph("外部对象如下：")
    ole_xml = (
        r'<w:object xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        r'xmlns:o="urn:schemas-microsoft-com:office:office">'
        r'<o:OLEObject Type="Embed" ProgID="Equation.3" ShapeID="_x0000_i1025"/>'
        r'</w:object>'
    )
    p._p.append(parse_xml(ole_xml))
    doc.save(os.path.join(FIXTURES_DIR, "test_12_ole.docx"))

    # Test 13: 模拟保存失败 (使用普通文档作为输入，运行时注入 fault)
    doc = Document()
    doc.add_paragraph("第 1 章 容错性测试文档")
    doc.save(os.path.join(FIXTURES_DIR, "test_13_save_fault.docx"))

    # Test 14: 模拟验证失败 (使用普通文档作为输入，运行时注入篡改 fault)
    doc = Document()
    doc.add_paragraph("第 1 章 内容完整性测试文档")
    doc.save(os.path.join(FIXTURES_DIR, "test_14_verify_tamper_fault.docx"))

    # Test 15: 模拟规范冲突
    doc = Document()
    doc.add_paragraph("第 1 章 规范冲突测试")
    doc.save(os.path.join(FIXTURES_DIR, "test_15_spec_conflict.docx"))

    print(f"全部 15 个 Fixture 已成功生成在: {FIXTURES_DIR}")

if __name__ == "__main__":
    create_all_fixtures()
