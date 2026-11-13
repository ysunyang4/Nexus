# -*- coding: utf-8 -*-
"""只读 OOXML 审计层。不依赖 Word；本模块任何函数都不写文件。
职责：对象清点、内容 Hash、分节/页眉页脚结构、段落角色分类、格式问题发现。"""
import os, re, zipfile, posixpath, hashlib
from collections import defaultdict
from lxml import etree
try:
    from .common import *
except ImportError:
    from common import *

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "dgm": "http://schemas.openxmlformats.org/drawingml/2006/diagram",
}


def q(p, t):
    return "{%s}%s" % (NS[p], t)


PARSER = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=True)
EXCL_FIELDS = {"TOC", "PAGE", "NUMPAGES", "SECTIONPAGES", "PAGEREF"}
SKIP_TAGS = {q("w", t) for t in ("pPr", "rPr", "tblPr", "trPr", "tcPr", "tblGrid", "sectPr")} | {q("mc", "Fallback")}

CHAPTER_RE = re.compile(r"^\s*第\s*[0-9一二三四五六七八九十百]+\s*章")
NUMHEAD_RE = re.compile(r"^\s*(\d{1,2}(\.\d{1,2}){0,3})\s+[^\d\s]")
CAP_RE = re.compile(r"^\s*(图|表|Figure|Fig\.?|Table)\s*[A-Z]?\d+(?:[-－—.．]\d+)*(?:[\s:：.、]|$)")
REFS_RE = re.compile(r"^\s*(参\s*考\s*文\s*献|References|REFERENCES|Bibliography)\s*[:：]?\s*$")
END_RE = re.compile(r"^\s*(致\s*谢|谢\s*辞|附\s*录|攻读.*(学位|期间)|作者简介|在学期间)")
LEAD_RE = re.compile(r"^([ \u3000]+)(\S)")
FRONT_TITLES = {"摘要", "摘  要", "摘 要", "abstract", "目录", "目  录", "目 录", "声明", "原创性声明"}


class Pkg:
    def __init__(self, path):
        with open(path, "rb") as f:
            head = f.read(8)
        if head[:4] == b"\xd0\xcf\x11\xe0":
            raise Blocked("OLE 复合文档：加密的 docx 或旧版 .doc，本 Skill 不处理（请用户另存为未加密 .docx）")
        try:
            self.z = zipfile.ZipFile(path)
        except zipfile.BadZipFile:
            raise Blocked("不是有效的 docx(zip) 文件")
        bad = self.z.testzip()
        if bad:
            raise Blocked("zip 内部损坏: %s" % bad)
        self.names = self.z.namelist()
        self._c = {}
        if "word/document.xml" not in self.names:
            raise Blocked("缺少 word/document.xml")
        self.media = [n for n in self.names if n.startswith("word/media/")]
        self.embeddings = [n for n in self.names if n.startswith("word/embeddings/")]
        self.has_vba = any("vbaProject" in n for n in self.names)

    def has(self, n):
        return n in self.names

    def xml(self, n):
        if n not in self._c:
            self._c[n] = etree.fromstring(self.z.read(n), PARSER)
        return self._c[n]

    def rels(self, part):
        d, b = posixpath.split(part)
        rp = posixpath.join(d, "_rels", b + ".rels")
        out = {}
        if rp in self.names:
            for rel in self.xml(rp):
                if rel.get("TargetMode") == "External":
                    continue
                t = rel.get("Target")
                tgt = t.lstrip("/") if t.startswith("/") else posixpath.normpath(posixpath.join(d, t))
                out[rel.get("Id")] = (tgt, rel.get("Type"))
        return out

    def close(self):
        self.z.close()


def _side(tag):
    n = tag.split("}")[1]
    return {"start": "left", "end": "right"}.get(n, n)


def _line(el, *names):
    if el is None:
        return None
    for n in names:
        s = el.find(q("w", n))
        if s is not None:
            return (s.get(q("w", "val")), int(s.get(q("w", "sz")) or 0))
    return None


def has_line(t):
    return t is not None and t[0] not in (None, "", "nil", "none")


class Styles:
    def __init__(self, pkg):
        self.by_id, self.def_ppr, self.def_rpr, self.default_p = {}, None, None, None
        if not pkg.has("word/styles.xml"):
            return
        root = pkg.xml("word/styles.xml")
        dd = root.find(q("w", "docDefaults"))
        if dd is not None:
            x = dd.find(q("w", "pPrDefault"))
            self.def_ppr = x.find(q("w", "pPr")) if x is not None else None
            x = dd.find(q("w", "rPrDefault"))
            self.def_rpr = x.find(q("w", "rPr")) if x is not None else None
        for st in root.findall(q("w", "style")):
            sid = st.get(q("w", "styleId"))
            nm, bo = st.find(q("w", "name")), st.find(q("w", "basedOn"))
            self.by_id[sid] = dict(
                name=nm.get(q("w", "val")) if nm is not None else sid, type=st.get(q("w", "type")),
                based=bo.get(q("w", "val")) if bo is not None else None,
                ppr=st.find(q("w", "pPr")), rpr=st.find(q("w", "rPr")), tblpr=st.find(q("w", "tblPr")))
            if st.get(q("w", "type")) == "paragraph" and st.get(q("w", "default")) in ("1", "true"):
                self.default_p = sid

    def chain(self, sid):
        out, seen = [], set()
        while sid and sid in self.by_id and sid not in seen:
            seen.add(sid)
            out.append(self.by_id[sid])
            sid = self.by_id[sid]["based"]
        return list(reversed(out))

    def heading_level(self, sid, direct_outline=None):
        if direct_outline is not None:
            return direct_outline + 1 if direct_outline < 9 else None
        for s in reversed(self.chain(sid or self.default_p)):
            nm = (s["name"] or "").lower().replace(" ", "")
            m = re.match(r"^(?:heading|标题)(\d)$", nm)
            if m:
                return int(m.group(1))
            ol = s["ppr"].find(q("w", "outlineLvl")) if s["ppr"] is not None else None
            if ol is not None:
                v = int(ol.get(q("w", "val")))
                return v + 1 if v < 9 else None
        return None

    def table_borders(self, sid):
        base = {}
        for s in self.chain(sid):
            tp = s["tblpr"]
            tb = tp.find(q("w", "tblBorders")) if tp is not None else None
            if tb is not None:
                for ch in tb:
                    if isinstance(ch.tag, str):
                        base[_side(ch.tag)] = (ch.get(q("w", "val")), int(ch.get(q("w", "sz")) or 0))
        return base


def _kind(instr):
    t = instr.strip().split(None, 1)
    return t[0].upper() if t else ""


def scan(containers, story, styles):
    recs, tables, cnt, bms = [], [], defaultdict(int), []
    stack = []
    st = {"sec": 1, "tdepth": 0, "tid": [], "txbx": 0, "ole": 0}

    def excl_result():
        return any(f["kind"] in EXCL_FIELDS and f["phase"] == "result" for f in stack)

    def in_toc():
        return any(f["kind"] == "TOC" and f["phase"] == "result" for f in stack)

    def new_rec(p):
        ppr = p.find(q("w", "pPr"))
        style, outline, hs = None, None, False
        if ppr is not None:
            ps = ppr.find(q("w", "pStyle"))
            style = ps.get(q("w", "val")) if ps is not None else None
            ol = ppr.find(q("w", "outlineLvl"))
            outline = int(ol.get(q("w", "val"))) if ol is not None else None
            hs = ppr.find(q("w", "sectPr")) is not None
        rec = dict(idx=len(recs), el=p, story=story, nested=st["txbx"] > 0, style=style,
                   hlevel=styles.heading_level(style, outline), in_table=st["tdepth"] > 0,
                   table=st["tid"][-1] if st["tid"] else None, toc=in_toc(), n_draw=0, n_math=0, n_ole=0,
                   n_field=0, section=st["sec"], has_sectpr=hs, text="", toc_text="", _p=[], _t=[])
        recs.append(rec)
        return rec

    def walk(el, cur):
        for ch in el:
            tag = ch.tag
            if not isinstance(tag, str) or tag in SKIP_TAGS:
                continue
            if tag == q("w", "p"):
                rec = new_rec(ch)
                walk(ch, rec)
                rec["text"] = "".join(rec.pop("_p"))
                rec["toc_text"] = "".join(rec.pop("_t"))
                if rec["has_sectpr"] and not rec["nested"]:
                    st["sec"] += 1
                continue
            if tag == q("w", "tbl"):
                tid = len(tables)
                info = dict(id=tid, el=ch, top=(st["tdepth"] == 0), parent=st["tid"][-1] if st["tid"] else None,
                            rows=0, cells=0, has_nested=False)
                tables.append(info)
                if info["parent"] is not None:
                    tables[info["parent"]]["has_nested"] = True
                st["tid"].append(tid)
                st["tdepth"] += 1
                walk(ch, None)
                st["tid"].pop()
                st["tdepth"] -= 1
                continue
            if tag == q("w", "tr") and st["tid"]:
                tables[st["tid"][-1]]["rows"] += 1
            elif tag == q("w", "tc") and st["tid"]:
                tables[st["tid"][-1]]["cells"] += 1
            elif tag == q("w", "fldChar"):
                t = ch.get(q("w", "fldCharType"))
                if t == "begin":
                    stack.append(dict(instr="", phase="instr", kind=""))
                    if cur is not None:
                        cur["n_field"] += 1
                elif t == "separate" and stack:
                    f = stack[-1]
                    f["kind"], f["phase"] = _kind(f["instr"]), "result"
                    if f["kind"] == "TOC" and cur is not None:
                        cur["toc"] = True
                elif t == "end" and stack:
                    f = stack.pop()
                    k = f["kind"] or _kind(f["instr"])
                    if k == "TOC":
                        cnt["toc"] += 1
                        if cur is not None:
                            cur["toc"] = True
                    elif k and not in_toc():
                        cnt["fields"] += 1
                        if k == "HYPERLINK":
                            cnt["hyperlinks"] += 1
                continue
            elif tag == q("w", "instrText"):
                if stack and stack[-1]["phase"] == "instr":
                    stack[-1]["instr"] += ch.text or ""
                continue
            elif tag == q("w", "fldSimple"):
                instr = ch.get(q("w", "instr")) or ""
                k = _kind(instr)
                if k == "TOC":
                    cnt["toc"] += 1
                    if cur is not None:
                        cur["toc"] = True
                elif k and not in_toc():
                    cnt["fields"] += 1
                    if k == "HYPERLINK":
                        cnt["hyperlinks"] += 1
                if cur is not None:
                    cur["n_field"] += 1
                stack.append(dict(instr=instr, phase="result", kind=k))
                walk(ch, cur)
                stack.pop()
                continue
            elif tag == q("m", "t"):
                if cur is not None:
                    mtxt = (ch.text or "").strip()
                    if in_toc():
                        cur["_t"].append(mtxt)
                    if not excl_result():
                        cur["_p"].append(mtxt)
                continue
            elif tag == q("w", "t"):
                if cur is not None:
                    if in_toc():
                        cur["_t"].append(ch.text or "")
                    if not excl_result():
                        cur["_p"].append(ch.text or "")
                continue
            elif tag == q("w", "tab"):
                if cur is not None and not excl_result():
                    cur["_p"].append("\t")
                continue
            elif tag in (q("w", "br"), q("w", "cr")):
                if cur is not None and not excl_result():
                    cur["_p"].append("\f" if ch.get(q("w", "type")) == "page" else "\n")
                continue
            elif tag == q("w", "noBreakHyphen"):
                if cur is not None and not excl_result():
                    cur["_p"].append("-")
                continue
            elif tag == q("w", "sym"):
                if cur is not None and not excl_result():
                    cur["_p"].append("<sym:%s:%s>" % (ch.get(q("w", "font")), ch.get(q("w", "char"))))
                continue
            elif tag == q("w", "hyperlink"):
                if not in_toc():
                    cnt["hyperlinks"] += 1
            elif tag == q("wp", "inline"):
                cnt["inline"] += 1
                if cur is not None:
                    cur["n_draw"] += 1
            elif tag == q("wp", "anchor"):
                cnt["anchor"] += 1
                if cur is not None:
                    cur["n_draw"] += 1
            elif tag == q("a", "blip"):
                if ch.get(q("r", "embed")) or ch.get(q("r", "link")):
                    cnt["blip"] += 1
            elif tag == q("v", "imagedata"):
                if st["ole"] == 0:
                    cnt["vml_img"] += 1
            elif tag == q("w", "pict"):
                cnt["pict"] += 1
                if cur is not None:
                    cur["n_draw"] += 1
            elif tag == q("w", "object"):
                cnt["ole"] += 1
                if cur is not None:
                    cur["n_ole"] += 1
                st["ole"] += 1
                walk(ch, cur)
                st["ole"] -= 1
                continue
            elif tag == q("m", "oMath"):
                cnt["omath"] += 1
                if cur is not None:
                    cur["n_math"] += 1
            elif tag == q("m", "oMathPara"):
                cnt["omathpara"] += 1
            elif tag == q("c", "chart"):
                cnt["chart"] += 1
            elif tag == q("dgm", "relIds"):
                cnt["smartart"] += 1
            elif tag == q("w", "sdt"):
                cnt["sdt"] += 1
            elif tag == q("w", "bookmarkStart"):
                bms.append(ch.get(q("w", "name")) or "")
            elif tag in (q("w", "ins"), q("w", "del"), q("w", "moveFrom"), q("w", "moveTo")):
                cnt["revisions"] += 1
            elif tag == q("w", "txbxContent"):
                st["txbx"] += 1
                walk(ch, cur)
                st["txbx"] -= 1
                continue
            walk(ch, cur)

    for c in containers:
        walk(c, None)
        # 每个顶层容器（脚注/批注）内的分节计数不累加
    return dict(recs=recs, tables=tables, cnt=dict(cnt), bookmarks=bms)


def analyze_table(t, styles):
    el = t["el"]
    trs = [c for c in el if c.tag == q("w", "tr")]
    merged, grid = False, []
    for tr in trs:
        row = []
        for tc in tr.findall(q("w", "tc")):
            pr = tc.find(q("w", "tcPr"))
            tcb = None
            if pr is not None:
                gs = pr.find(q("w", "gridSpan"))
                if gs is not None and int(gs.get(q("w", "val")) or 1) > 1:
                    merged = True
                if pr.find(q("w", "vMerge")) is not None or pr.find(q("w", "hMerge")) is not None:
                    merged = True
                tcb = pr.find(q("w", "tcBorders"))
            row.append(tcb)
        grid.append(row)
    tpr = el.find(q("w", "tblPr"))
    sid = None
    if tpr is not None and tpr.find(q("w", "tblStyle")) is not None:
        sid = tpr.find(q("w", "tblStyle")).get(q("w", "val"))
    base = dict(styles.table_borders(sid)) if sid else {}
    tb = tpr.find(q("w", "tblBorders")) if tpr is not None else None
    if tb is not None:
        for ch in tb:
            if isinstance(ch.tag, str):
                base[_side(ch.tag)] = (ch.get(q("w", "val")), int(ch.get(q("w", "sz")) or 0))
    nr = len(grid)

    def eff(r, c, side):
        names = {"left": ("left", "start"), "right": ("right", "end")}.get(side, (side,))
        ex = _line(grid[r][c], *names)
        if ex is not None:
            return ex
        lr, lc = nr - 1, len(grid[r]) - 1
        if side == "top":
            return base.get("top") if r == 0 else base.get("insideH")
        if side == "bottom":
            return base.get("bottom") if r == lr else base.get("insideH")
        if side == "left":
            return base.get("left") if c == 0 else base.get("insideV")
        return base.get("right") if c == lc else base.get("insideV")

    vertical, top_sz, bottom_sz, head_sz, inner_h = False, 0, 0, 0, False
    for r in range(nr):
        for c in range(len(grid[r])):
            if has_line(eff(r, c, "left")) or has_line(eff(r, c, "right")):
                vertical = True
    if nr:
        top_sz = max([eff(0, c, "top")[1] for c in range(len(grid[0])) if has_line(eff(0, c, "top"))] or [0])
        bottom_sz = max([eff(nr - 1, c, "bottom")[1] for c in range(len(grid[-1])) if has_line(eff(nr - 1, c, "bottom"))] or [0])
    if nr >= 2:
        hs = []
        for c in range(len(grid[0])):
            if has_line(eff(0, c, "bottom")):
                hs.append(eff(0, c, "bottom")[1])
            if c < len(grid[1]) and has_line(eff(1, c, "top")):
                hs.append(eff(1, c, "top")[1])
        head_sz = max(hs or [0])
        for r in range(1, nr - 1):
            for c in range(len(grid[r])):
                if has_line(eff(r, c, "bottom")) or (c < len(grid[r + 1]) and has_line(eff(r + 1, c, "top"))):
                    inner_h = True
    t.update(merged=merged, vertical=vertical, top_sz=top_sz, bottom_sz=bottom_sz, header_sz=head_sz,
             inner_h=inner_h, nr=nr)
    return t


def hf_info(pkg, part, styles, cache):
    if part in cache:
        return cache[part]
    info = dict(text="", has_page=False)
    if part and pkg.has(part):
        root = pkg.xml(part)
        res = scan([root], "hf", styles)
        info["text"] = "".join(r["text"] for r in res["recs"]).strip()
        instr = " ".join((e.text or "") for e in root.iter(q("w", "instrText"))) + " " + \
                " ".join((e.get(q("w", "instr")) or "") for e in root.iter(q("w", "fldSimple")))
        info["has_page"] = bool(re.search(r"(?<![A-Z])PAGE(?![A-Z])", instr.upper()))
    cache[part] = info
    return info


def parse_sections(doc, pkg, styles):
    rels = pkg.rels("word/document.xml")
    out, cache = [], {}
    prev = {}
    for sp in doc.iter(q("w", "sectPr")):
        par = sp.getparent()
        if par is None or par.tag not in (q("w", "pPr"), q("w", "body")):
            continue
        d = dict(index=len(out) + 1)
        t = sp.find(q("w", "type"))
        d["type"] = t.get(q("w", "val")) if t is not None else "nextPage"
        pg = sp.find(q("w", "pgSz"))
        if pg is not None:
            d["w"], d["h"] = int(pg.get(q("w", "w")) or 0), int(pg.get(q("w", "h")) or 0)
        mar = sp.find(q("w", "pgMar"))
        if mar is not None:
            for k in ("top", "bottom", "left", "right", "header", "footer", "gutter"):
                d["mar_" + k] = int(mar.get(q("w", k)) or 0)
        pn = sp.find(q("w", "pgNumType"))
        d["pg_fmt"] = (pn.get(q("w", "fmt")) if pn is not None else None) or "decimal"
        d["pg_start"] = int(pn.get(q("w", "start"))) if pn is not None and pn.get(q("w", "start")) else None
        d["title_pg"] = sp.find(q("w", "titlePg")) is not None
        res = {}
        for kind in ("header", "footer"):
            for typ in ("default", "first", "even"):
                key = "%s_%s" % (kind, typ)
                tgt = None
                for ref in sp.findall(q("w", kind + "Reference")):
                    if ref.get(q("w", "type")) == typ:
                        tgt = rels.get(ref.get(q("r", "id")), (None,))[0]
                explicit = tgt
                resolved = tgt or prev.get(key)
                d[key + "_explicit"] = explicit
                d[key + "_resolved"] = resolved
                d[key + "_linked"] = (explicit is None and d["index"] > 1) or (explicit is not None and explicit == prev.get(key))
                d[key + "_info"] = hf_info(pkg, resolved, styles, cache) if resolved else dict(text="", has_page=False)
                res[key] = resolved
        prev = res
        out.append(d)
    return out


def _streams_hash(streams):
    parts = []
    for story in ("document", "footnotes", "endnotes", "comments"):
        parts.append("\x1d" + story)
        for s in streams.get(story, []):
            if s.strip():
                parts.append(s)
    return sha256_text("\x1e".join(parts))


def hash_streams(streams):
    return _streams_hash(streams)


def expected_streams_after_cleanup(before, cleaned_positions):
    """把 before 的正文流中、被授权清理伪缩进的段落（以非 TOC 序号 pos 表示）做 lstrip 后得到的期望文本流。"""
    s = {k: list(v) for k, v in before["streams"].items()}
    for p in cleaned_positions:
        s["document"][p] = s["document"][p].lstrip(" \u3000")
    return s


def inventory(path):
    pkg = Pkg(path)
    try:
        styles = Styles(pkg)
        doc = pkg.xml("word/document.xml")
        body = doc.find(q("w", "body"))
        main = scan([body], "document", styles)
        streams, extra = {}, {}
        recs = main["recs"]
        non_toc = [r for r in recs if not r["toc"]]
        pos_of_idx = {r["idx"]: i for i, r in enumerate(non_toc)}
        streams["document"] = [r["text"] for r in non_toc]
        notes = {}
        for story, part, tag in (("footnotes", "word/footnotes.xml", "footnote"), ("endnotes", "word/endnotes.xml", "endnote"),
                                 ("comments", "word/comments.xml", "comment")):
            elems = []
            if pkg.has(part):
                for e in pkg.xml(part).findall(q("w", tag)):
                    if e.get(q("w", "type")) in ("separator", "continuationSeparator", "continuationNotice"):
                        continue
                    elems.append(e)
            notes[story] = len(elems)
            res = scan(elems, story, styles) if elems else dict(recs=[])
            streams[story] = [r["text"] for r in res["recs"] if not r["toc"]]
        for t in main["tables"]:
            analyze_table(t, styles)
        cnt = main["cnt"]
        bms = main["bookmarks"]
        user_bm = [b for b in bms if not (b.startswith("_Toc") or b == "_GoBack")]
        sections = parse_sections(doc, pkg, styles)
        settings = {}
        if pkg.has("word/settings.xml"):
            s = pkg.xml("word/settings.xml")
            e = s.find(q("w", "evenAndOddHeaders"))
            settings["even_odd"] = e is not None and e.get(q("w", "val")) not in ("0", "false", "off")
            e = s.find(q("w", "trackRevisions"))
            settings["track_revisions"] = e is not None and e.get(q("w", "val")) not in ("0", "false", "off")
            e = s.find(q("w", "documentProtection"))
            settings["protected"] = e is not None and e.get(q("w", "enforcement")) in ("1", "true", "on")
        else:
            settings = dict(even_odd=False, track_revisions=False, protected=False)
        hf_texts = []
        for n in sorted(pkg.names):
            if re.match(r"word/(header|footer)\d*\.xml$", n):
                res = scan([pkg.xml(n)], "hf", styles)
                hf_texts.append("".join(r["text"] for r in res["recs"]))
        heads = [r for r in non_toc if r["hlevel"] and not r["nested"]]
        tab_top = [t for t in main["tables"] if t["top"]]
        allp = [r for r in non_toc if not r["nested"]]
        inv = dict(
            path=path, sha256=sha256_file(path), size=os.path.getsize(path),
            paragraphs=len(allp), paragraphs_textbox=len([r for r in non_toc if r["nested"]]),
            tables=len(main["tables"]), tables_top=len(tab_top),
            rows=sum(t["rows"] for t in main["tables"]), cells=sum(t["cells"] for t in main["tables"]),
            inline_shapes=cnt.get("inline", 0), anchored_shapes=cnt.get("anchor", 0), pict=cnt.get("pict", 0),
            images=cnt.get("blip", 0) + cnt.get("vml_img", 0), media_parts=len(pkg.media),
            ole_objects=cnt.get("ole", 0), ole_parts=len(pkg.embeddings),
            equations=cnt.get("omath", 0), equation_paras=cnt.get("omathpara", 0),
            footnotes=notes["footnotes"], endnotes=notes["endnotes"],
            bookmarks=len(user_bm), bookmarks_auto=len(bms) - len(user_bm),
            hyperlinks=cnt.get("hyperlinks", 0), comments=notes["comments"], sections=len(sections),
            headings=len(heads), content_controls=cnt.get("sdt", 0), fields=cnt.get("fields", 0),
            charts=cnt.get("chart", 0), smartart=cnt.get("smartart", 0), toc_fields=cnt.get("toc", 0),
            revisions=cnt.get("revisions", 0), has_vba=pkg.has_vba, settings=settings,
            chars=sum(len(x) for x in streams["document"]),
            text_hash=_streams_hash(streams),
            hf_text_hash=sha256_text("\x1e".join(hf_texts)),
            para_hashes=[hashlib.sha1(x.encode("utf-8")).hexdigest()[:10] for x in streams["document"]],
            streams=streams, pos_of_idx=pos_of_idx, recs=recs, tables_info=main["tables"],
            sections_detail=sections, bookmark_names=user_bm)
        return inv
    finally:
        pkg.close()


def public(inv):
    """可序列化、可写入报告的精简版（不含 lxml 元素和全文）。"""
    skip = {"streams", "recs", "tables_info", "sections_detail", "para_hashes", "pos_of_idx", "bookmark_names"}
    d = {k: v for k, v in inv.items() if k not in skip}
    return d


def assign_roles(inv, plan=None):
    plan = plan or {}
    recs = inv["recs"]
    conf = {int(k): int(v) for k, v in (plan.get("confirmed_headings") or {}).items()}
    roles, extra = [None] * len(recs), [dict() for _ in recs]
    for r in recs:
        i, t = r["idx"], r["text"].strip()
        if r["toc"]:
            roles[i] = "toc"
        elif r["nested"]:
            roles[i] = "other"
        elif r["in_table"]:
            roles[i] = "table_cell"
        else:
            lvl = conf.get(i) or r["hlevel"]
            has_obj = r["n_draw"] or r["n_math"] or r["n_ole"]
            if lvl and t:
                roles[i] = "heading%d" % lvl if lvl <= 4 else "other"
            elif not t and not has_obj:
                roles[i] = "empty"
            elif not t and r["n_draw"] and not r["n_math"] and not r["n_ole"]:
                roles[i] = "figure"
            elif has_obj:
                roles[i] = "object_para"
            else:
                roles[i] = "text"
    seq = [r for r in recs if not r["toc"] and not r["nested"]]
    spos = {r["idx"]: k for k, r in enumerate(seq)}
    for r in seq:
        i = r["idx"]
        if roles[i] != "text" and not (roles[i] == "object_para"):
            continue
        t = r["text"].strip()
        if roles[i] == "text" and CAP_RE.match(t) and len(t) <= 100:
            k = spos[i]
            prev = seq[k - 1] if k > 0 else None
            nxt = seq[k + 1] if k + 1 < len(seq) else None
            kind = "fig" if re.match(r"^\s*(图|Figure|Fig)", t) else "tbl"
            pos = None
            if kind == "fig":
                if prev is not None and roles[prev["idx"]] == "figure":
                    pos = "below"
                elif nxt is not None and roles[nxt["idx"]] == "figure":
                    pos = "above"
            else:
                if nxt is not None and nxt["in_table"] and nxt["table"] is not None:
                    pos = "above"
                elif prev is not None and prev["in_table"]:
                    pos = "below"
            if pos:
                roles[i] = "caption_" + kind
                extra[i] = dict(cap=kind, pos=pos)
            else:
                roles[i] = "caption_unlinked"
    ref_idx = None
    for r in seq:
        if REFS_RE.match(r["text"]) and not r["in_table"]:
            ref_idx = r["idx"]
    start = plan.get("body_start_paragraph")
    if start is None:
        for r in seq:
            if r["hlevel"] == 1 and r["text"].strip().lower() not in FRONT_TITLES and (
                    CHAPTER_RE.match(r["text"]) or r["text"].strip() in ("绪论", "引言", "前言", "Introduction", "INTRODUCTION")):
                start = r["idx"]
                break
    inv["_scope_start"], inv["_refs_idx"] = start, ref_idx
    in_refs, ended, rl = False, False, 1
    for r in seq:
        i = r["idx"]
        if ref_idx is not None and i == ref_idx:
            in_refs, rl = True, (r["hlevel"] or 1)
            if roles[i] == "text":
                roles[i] = "refs_heading"
            continue
        if in_refs and not ended:
            lv = r["hlevel"]
            if (lv and lv <= rl and roles[i].startswith("heading")) or END_RE.match(r["text"]):
                ended = True
            elif roles[i] == "text":
                roles[i] = "ref_entry"
                continue
        if ended and roles[i] == "text":
            roles[i] = "back"
            continue
        if roles[i] == "text":
            roles[i] = "body" if (start is not None and i >= start) else "front"
    return roles, extra


def findings(inv, roles, extra):
    """只读发现：不修改任何东西。返回 [(level, text)]。"""
    f, recs = [], inv["recs"]
    secs = inv["sections_detail"]
    for d in secs[1:]:
        for kind in ("header", "footer"):
            if d.get("%s_default_linked" % kind) and (d.get("%s_default_resolved" % kind)):
                f.append(("WARN", "第 %d 节 %s LinkToPrevious = TRUE" % (d["index"], "页眉" if kind == "header" else "页脚")))
    pseudo = []
    for r in recs:
        if roles[r["idx"]] in ("body", "front", "back", "ref_entry", "text"):
            m = LEAD_RE.match(r["text"])
            if m and (len(m.group(1)) >= 2 or "\u3000" in m.group(1)):
                pseudo.append(r["idx"])
    inv["_pseudo"] = pseudo
    if pseudo:
        f.append(("WARN", "%d 个段落存在伪缩进空格（清理需用户授权）" % len(pseudo)))
    vt = [t for t in inv["tables_info"] if t["top"] and t["vertical"]]
    if vt:
        f.append(("WARN", "%d 个表格存在竖线" % len(vt)))
    cx = [t for t in inv["tables_info"] if t["merged"] or t["has_nested"] or t["parent"] is not None]
    if cx:
        f.append(("INFO", "%d 个复杂表格（合并/嵌套），默认不修改，进入 REVIEW" % len(cx)))
    if inv["toc_fields"] == 0:
        f.append(("INFO", "未发现 TOC 字段（本 Skill 不创建目录，只更新已有目录）"))
    else:
        toc_text = "".join(r["toc_text"] for r in recs if r["toc"])
        miss = [r["text"].strip() for r in recs if roles[r["idx"]].startswith("heading") and r["hlevel"] and r["hlevel"] <= 3
                and r["text"].strip() and r["text"].strip() not in toc_text]
        f.append(("WARN" if miss else "INFO", "TOC 已存在" + ("，但有 %d 个标题未出现在目录中，疑似未更新" % len(miss) if miss else "")))
    cands = [r["idx"] for r in recs if roles[r["idx"]] in ("body", "front") and len(r["text"].strip()) <= 40
             and (CHAPTER_RE.match(r["text"]) or NUMHEAD_RE.match(r["text"]))
             and not re.search(r"[。；;，,]$", r["text"].strip())]
    inv["_heading_candidates"] = cands
    if cands:
        f.append(("REVIEW", "%d 个疑似标题的��通段落（未使用标题样式）：%s —— 未自动修改，需用户确认" %
                  (len(cands), ", ".join("P%d" % c for c in cands[:10]) + (" …" if len(cands) > 10 else ""))))
    unl = [r["idx"] for r in recs if roles[r["idx"]] == "caption_unlinked"]
    if unl:
        f.append(("REVIEW", "%d 个疑似图表题注找不到相邻图/表，未自动修改" % len(unl)))
    if inv["_refs_idx"] is None:
        f.append(("INFO", "未识别到“参考文献”标题，参考文献格式不会被处理"))
    if inv["_scope_start"] is None:
        f.append(("REVIEW", "无法确定正文起点（需要 plan.body_start_paragraph 或章标题样式），正文格式不会被处理"))
    if inv["revisions"] or inv["settings"].get("track_revisions"):
        f.append(("BLOCKED", "文档含修订标记/开启了修订（%d 处）：必须先由用户接受或拒绝修订" % inv["revisions"]))
    if inv["settings"].get("protected"):
        f.append(("BLOCKED", "文档受保护（documentProtection 已强制）：不尝试绕过"))
    if inv["has_vba"]:
        f.append(("BLOCKED", "文档含宏（vbaProject）：本 Skill 只处理 .docx"))
    if inv["ole_objects"]:
        f.append(("INFO", "%d 个 OLE/嵌入对象：默认视为不可修改对象" % inv["ole_objects"]))
    ea, asc = defaultdict(int), defaultdict(int)
    for r in recs:
        for rf in r["el"].iter(q("w", "rFonts")):
            if rf.get(q("w", "eastAsia")):
                ea[rf.get(q("w", "eastAsia"))] += 1
            if rf.get(q("w", "ascii")):
                asc[rf.get(q("w", "ascii"))] += 1
    inv["_fonts"] = (dict(ea), dict(asc))
    if len(ea) >= 3:
        f.append(("WARN", "%d 种中文字体混用：%s" % (len(ea), "、".join(sorted(ea)))))
    return f
