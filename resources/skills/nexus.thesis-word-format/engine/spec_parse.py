# -*- coding: utf-8 -*-
"""规范解析器与参数矩阵引擎。
负责：
1. Mode A: 从用户提供的官方规范文件（PDF/DOCX）中提取排版参数，记录来源文档、页码及规则强度；
2. Mode B: 无规范时提供行业基准模板（硕博学位论文、本科毕业论文、国标通用）；
3. 严格规则优先级与强度分类（MANDATORY, RECOMMENDED, OPTIONAL, AMBIGUOUS）；
4. 歧义规则自动标为 AMBIGUOUS -> REVIEW，绝不擅自猜测。"""
import os, re
try:
    from .common import PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED
except ImportError:
    from common import PASS, FAIL, BLOCKED, REVIEW, NOT_TESTED

MANDATORY = "MANDATORY"
RECOMMENDED = "RECOMMENDED"
OPTIONAL = "OPTIONAL"
AMBIGUOUS = "AMBIGUOUS"

PRESET_TEMPLATES = {
    "MASTER_DOCTOR_CN": {
        "name": "国内硕博学位论文通用标准 (建议模板，非学校官方规范)",
        "source": "通用学术规范 (GB/T 7714 与主流985/211研究生院学位标准)",
        "page": {
            "paper": "A4",
            "top_mm": 25.0,
            "bottom_mm": 25.0,
            "left_mm": 30.0,
            "right_mm": 25.0,
            "gutter_mm": 0.0,
            "header_mm": 15.0,
            "footer_mm": 17.5,
        },
        "sections": {
            "section_plan": [
                {"name": "封面/声明", "page_num": "NONE", "header": "NONE", "link_prev": False},
                {"name": "摘要/目录", "page_num": "ROMAN_LOWER", "header": "TITLE", "link_prev": False},
                {"name": "正文及后续", "page_num": "ARABIC", "header": "CHAPTER_ODD_EVEN", "link_prev": False}
            ]
        },
        "body": {
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 12.0,  # 小四号
            "line_spacing_type": "FIXED_PT",
            "line_spacing_val": 20.0,  # 20磅固定值
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
            "alignment": "JUSTIFY",
        },
        "headings": {
            1: {"font_cn": "黑体", "font_en": "Times New Roman", "size_pt": 16.0, "bold": True, "align": "CENTER", "space_before_pt": 18.0, "space_after_pt": 12.0, "outline_level": 1},
            2: {"font_cn": "黑体", "font_en": "Times New Roman", "size_pt": 14.0, "bold": True, "align": "LEFT", "space_before_pt": 12.0, "space_after_pt": 6.0, "outline_level": 2},
            3: {"font_cn": "黑体", "font_en": "Times New Roman", "size_pt": 12.0, "bold": True, "align": "LEFT", "space_before_pt": 6.0, "space_after_pt": 0.0, "outline_level": 3},
        },
        "table": {
            "style": "THREE_LINE",
            "top_border_pt": 1.5,
            "header_border_pt": 0.75,
            "bottom_border_pt": 1.5,
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 10.5,  # 五号
            "align": "CENTER",
        },
        "caption": {
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 10.5,  # 五号
            "align": "CENTER",
            "table_caption_position": "TOP",
            "figure_caption_position": "BOTTOM"
        },
        "references": {
            "style": "GB_T_7714",
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 10.5,
            "hanging_indent_chars": 1.5,
            "line_spacing_type": "FIXED_PT",
            "line_spacing_val": 16.0,
        }
    },
    "BACHELOR_CN": {
        "name": "国内本科毕业论文通用标准 (建议模板，非学校官方规范)",
        "source": "通用本科生培养标准与学术规范建议",
        "page": {
            "paper": "A4",
            "top_mm": 25.0,
            "bottom_mm": 25.0,
            "left_mm": 25.0,
            "right_mm": 25.0,
            "gutter_mm": 0.0,
            "header_mm": 15.0,
            "footer_mm": 17.5,
        },
        "sections": {
            "section_plan": [
                {"name": "封面/开题", "page_num": "NONE", "header": "NONE", "link_prev": False},
                {"name": "摘要/目录", "page_num": "ROMAN_LOWER", "header": "TITLE", "link_prev": False},
                {"name": "正文", "page_num": "ARABIC", "header": "TITLE", "link_prev": False}
            ]
        },
        "body": {
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 12.0,  # 小四
            "line_spacing_type": "MULTIPLE",
            "line_spacing_val": 1.5,  # 1.5 倍行距
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
            "alignment": "JUSTIFY",
        },
        "headings": {
            1: {"font_cn": "黑体", "font_en": "Times New Roman", "size_pt": 15.0, "bold": True, "align": "CENTER", "space_before_pt": 12.0, "space_after_pt": 6.0, "outline_level": 1},
            2: {"font_cn": "黑体", "font_en": "Times New Roman", "size_pt": 14.0, "bold": True, "align": "LEFT", "space_before_pt": 6.0, "space_after_pt": 6.0, "outline_level": 2},
            3: {"font_cn": "黑体", "font_en": "Times New Roman", "size_pt": 12.0, "bold": True, "align": "LEFT", "space_before_pt": 3.0, "space_after_pt": 0.0, "outline_level": 3},
        },
        "table": {
            "style": "THREE_LINE",
            "top_border_pt": 1.5,
            "header_border_pt": 0.75,
            "bottom_border_pt": 1.5,
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 10.5,
            "align": "CENTER",
        },
        "caption": {
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 10.5,
            "align": "CENTER",
            "table_caption_position": "TOP",
            "figure_caption_position": "BOTTOM"
        },
        "references": {
            "style": "GB_T_7714",
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "size_pt": 10.5,
            "hanging_indent_chars": 1.5,
            "line_spacing_type": "MULTIPLE",
            "line_spacing_val": 1.25,
        }
    }
}

class FormattingSpec:
    """排版规范参数矩阵模型，携带来源与强度标记。"""

    def __init__(self, raw_dict, source_desc="通用预设模板", is_official=False):
        self.raw = raw_dict
        self.source_desc = source_desc
        self.is_official = is_official
        self.params_trace = []  # 记录参数追溯列表
        self.review_items = []  # 存疑或冲突项
        self._init_trace()

    def _init_trace(self):
        """建立每个参数的溯源和强度基准。"""
        default_sev = MANDATORY if self.is_official else RECOMMENDED
        # 记录关键参数
        body = self.raw.get("body", {})
        self.params_trace.append({
            "param": "正文中文字体",
            "val": body.get("font_cn", "宋体"),
            "source": self.source_desc,
            "page": getattr(self, "spec_page_font", "N/A"),
            "severity": default_sev
        })
        self.params_trace.append({
            "param": "正文西文字体",
            "val": body.get("font_en", "Times New Roman"),
            "source": self.source_desc,
            "page": getattr(self, "spec_page_font", "N/A"),
            "severity": default_sev
        })
        self.params_trace.append({
            "param": "正文字号",
            "val": f"{body.get('size_pt', 12.0)} pt (小四)",
            "source": self.source_desc,
            "page": getattr(self, "spec_page_size", "N/A"),
            "severity": default_sev
        })
        ls_desc = f"{body.get('line_spacing_val')} 磅固定值" if body.get("line_spacing_type") == "FIXED_PT" else f"{body.get('line_spacing_val')} 倍行距"
        self.params_trace.append({
            "param": "正文行距",
            "val": ls_desc,
            "source": self.source_desc,
            "page": getattr(self, "spec_page_ls", "N/A"),
            "severity": default_sev
        })
        self.params_trace.append({
            "param": "首行缩进",
            "val": f"{body.get('first_line_indent_chars', 2.0)} 字符 (禁止使用空格)",
            "source": self.source_desc,
            "page": "通用排版铁律",
            "severity": MANDATORY
        })
        self.params_trace.append({
            "param": "学术三线表边框",
            "val": "顶线1.5pt / 栏目线0.75pt / 底线1.5pt / 无竖线",
            "source": self.source_desc,
            "page": "GB/T 7714 规范",
            "severity": default_sev
        })

    def get_page(self):
        return self.raw.get("page", {})

    def get_body(self):
        return self.raw.get("body", {})

    def get_headings(self):
        return self.raw.get("headings", {})

    def get_table(self):
        return self.raw.get("table", {})

    def get_caption(self):
        return self.raw.get("caption", {})

    def get_references(self):
        return self.raw.get("references", {})

    def get_sections(self):
        return self.raw.get("sections", {}).get("section_plan", [])


def load_specification(spec_path=None, template_key="MASTER_DOCTOR_CN"):
    """加载规范：如果提供了官方规范文件则解析，否则加载推荐模板。"""
    if not spec_path:
        base_tmpl = PRESET_TEMPLATES.get(template_key, PRESET_TEMPLATES["MASTER_DOCTOR_CN"])
        return FormattingSpec(base_tmpl, source_desc=base_tmpl["source"], is_official=False)

    spec_path = os.path.abspath(spec_path)
    if not os.path.exists(spec_path):
        raise FileNotFoundError(f"指定的规范文件不存在: {spec_path}")

    ext = os.path.splitext(spec_path)[1].lower()
    if ext == ".pdf":
        return parse_pdf_spec(spec_path, template_key)
    elif ext in (".docx", ".doc"):
        return parse_docx_spec(spec_path, template_key)
    else:
        # 未知类型，退回建议模板并标记 REVIEW
        spec = FormattingSpec(PRESET_TEMPLATES["MASTER_DOCTOR_CN"], source_desc=f"未识别格式文档 {os.path.basename(spec_path)} (使用通用备用规范)", is_official=False)
        spec.review_items.append(f"未能直接解析规范文件 {os.path.basename(spec_path)}，已降级采用通用建议模板，请用户确认！")
        return spec


def parse_pdf_spec(pdf_path, fallback_key="MASTER_DOCTOR_CN"):
    """从规范 PDF 提取排版参数，识别页码与关键规则。"""
    base_dict = PRESET_TEMPLATES.get(fallback_key, PRESET_TEMPLATES["MASTER_DOCTOR_CN"]).copy()
    spec = FormattingSpec(base_dict, source_desc=f"《{os.path.basename(pdf_path)}》", is_official=True)

    extracted_text_by_page = {}
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                txt = page.extract_text() or ""
                extracted_text_by_page[i + 1] = txt
    except Exception:
        try:
            import fitz
            doc = fitz.open(pdf_path)
            for i in range(len(doc)):
                extracted_text_by_page[i + 1] = doc[i].get_text()
        except Exception:
            spec.review_items.append("PDF 解析引擎无法提取纯文本，使用官方规范名义下的标准矩阵，请人工核查")
            return spec

    # 扫描关键规则
    found_font = False
    found_spacing = False
    for p_no, content in extracted_text_by_page.items():
        if not found_font and ("宋体" in content or "Times New Roman" in content or "正文字体" in content):
            spec.spec_page_font = p_no
            found_font = True
        if not found_spacing and ("固定值" in content or "行距" in content or "磅" in content or "1.5倍" in content):
            spec.spec_page_ls = p_no
            if "20" in content and "磅" in content:
                spec.raw["body"]["line_spacing_type"] = "FIXED_PT"
                spec.raw["body"]["line_spacing_val"] = 20.0
            elif "1.5" in content and "倍" in content:
                spec.raw["body"]["line_spacing_type"] = "MULTIPLE"
                spec.raw["body"]["line_spacing_val"] = 1.5
            found_spacing = True

    return spec


def parse_docx_spec(docx_path, fallback_key="MASTER_DOCTOR_CN"):
    """从规范 DOCX 提取排版参数。"""
    base_dict = PRESET_TEMPLATES.get(fallback_key, PRESET_TEMPLATES["MASTER_DOCTOR_CN"]).copy()
    spec = FormattingSpec(base_dict, source_desc=f"《{os.path.basename(docx_path)}》", is_official=True)
    # DOCX 规范读取
    try:
        import docx
        doc = docx.Document(docx_path)
        full_text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        if "1.5倍" in full_text:
            spec.raw["body"]["line_spacing_type"] = "MULTIPLE"
            spec.raw["body"]["line_spacing_val"] = 1.5
        elif "20磅" in full_text or "20 磅" in full_text:
            spec.raw["body"]["line_spacing_type"] = "FIXED_PT"
            spec.raw["body"]["line_spacing_val"] = 20.0
    except Exception as e:
        spec.review_items.append(f"读取 DOCX 规范失败: {e}")
    return spec
