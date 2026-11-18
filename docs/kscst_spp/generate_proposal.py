#!/usr/bin/env python3
"""Fill the official KSCST SPP 50S proposal template for Startup Sandbox.

Edits the original template in place (same tables, header, footer and page
layout), mirroring the reference proposal: instructional notes, the
Endorsement page and the KSCST bank-details page are removed. Personal,
institutional and payment fields are left blank for the applicant.
"""

import copy
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "KSCST_SPP_50S_Proposal_Format_template.docx"
OUT_DOCX = HERE / "KSCST_SPP_50S_Proposal_Startup_Sandbox_FILLED.docx"
DIAGRAM = HERE / "startup_sandbox_block_diagram.png"

FONT = "Cambria"
HEADER_BLOCKS = 5  # logo + KSCST address lines keep the template's Arial
BODY_PT = 11

TITLE = (
    "DESIGN AND DEVELOPMENT OF STARTUP SANDBOX: AN AI-POWERED PLATFORM FOR STARTUP "
    "VALIDATION, FOUNDER DECISION SIMULATION AND ADAPTIVE ENTREPRENEURSHIP LEARNING"
)
KEYWORDS = (
    "STARTUP VALIDATION, MACHINE LEARNING (XGBOOST), GENERATIVE AI, FOUNDER DECISION "
    "SIMULATION, DIGITAL TWIN, ADAPTIVE LEARNING, BUSINESS INTELLIGENCE, ENTREPRENEURSHIP EDUCATION"
)
THEME_NO = "04"
THEME_NAME = "ARTIFICIAL INTELLIGENCE, DATA SCIENCE AND DIGITAL TECHNOLOGIES"
SUB_THEME = (
    "ARTIFICIAL INTELLIGENCE (AI) AND MACHINE LEARNING (ML); DECISION SUPPORT SYSTEMS AND "
    "INTELLIGENT INFORMATION SYSTEMS; DIGITAL TWINS, MODELLING AND SIMULATION"
)


# ---------------------------------------------------------------- helpers

def remove(p):
    p._p.getparent().remove(p._p)


def style_run(run, bold=False, size=BODY_PT, italic=False):
    run.font.name = FONT
    rpr = run._r.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(attr), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    return run


def clear_runs(p):
    for child in list(p._p):
        if child.tag in (qn("w:r"), qn("w:hyperlink")):
            p._p.remove(child)


def set_label_value(p, label, value, label_size=12):
    """Rewrite a template label paragraph as 'LABEL value', keeping the label's own run style."""
    base = p.runs[0]._r.rPr if p.runs else None
    base = copy.deepcopy(base) if base is not None else None
    clear_runs(p)
    lab = p.add_run(label)
    if base is not None:
        lab._r.insert(0, copy.deepcopy(base))
        lab.bold = True
        lab.italic = False
    else:
        style_run(lab, bold=True, size=label_size)
    if value:
        val = p.add_run(" " + value)
        style_run(val, bold=False, size=label_size)
        val.font.color.rgb = None


def strip_numbering(pPr):
    num = pPr.find(qn("w:numPr"))
    if num is not None:
        pPr.remove(num)


class CellWriter:
    """Appends formatted content to the end of a table cell."""

    def __init__(self, cell, base_par):
        self.cell = cell
        self.base_pPr = copy.deepcopy(base_par._p.pPr) if base_par._p.pPr is not None else None

    def _new(self, align=WD_ALIGN_PARAGRAPH.JUSTIFY, indent=None, space_after=4):
        p = self.cell.add_paragraph()
        if self.base_pPr is not None:
            p._p.insert(0, copy.deepcopy(self.base_pPr))
            strip_numbering(p._p.pPr)
        p.alignment = align
        pf = p.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(space_after)
        pf.line_spacing = 1.15
        if indent is not None:
            pf.left_indent = Inches(indent)
            pf.first_line_indent = Inches(-0.2) if indent else None
        return p

    def para(self, text, bold=False, italic=False):
        style_run(self._new().add_run(text), bold=bold, italic=italic)

    def rich(self, parts, indent=None):
        p = self._new(indent=indent)
        for text, bold in parts:
            style_run(p.add_run(text), bold=bold)

    def head(self, text):
        style_run(self._new(space_after=2).add_run(text), bold=True)

    def bullet(self, text, label=None):
        p = self._new(indent=0.25)
        style_run(p.add_run("•  "))
        if label:
            style_run(p.add_run(label + ": "), bold=True)
        style_run(p.add_run(text))

    def numbered(self, n, text, label=None):
        p = self._new(indent=0.3)
        style_run(p.add_run(f"{n}.  "))
        if label:
            style_run(p.add_run(label + ": "), bold=True)
        style_run(p.add_run(text))

    def image(self, path, width_in):
        p = self._new(align=WD_ALIGN_PARAGRAPH.CENTER)
        p.add_run().add_picture(str(path), width=Inches(width_in))

    def caption(self, text):
        p = self._new(align=WD_ALIGN_PARAGRAPH.CENTER)
        style_run(p.add_run(text), italic=True, size=10)

    def table(self, headers, rows, size=9):
        t = self.cell.add_table(rows=1 + len(rows), cols=len(headers))
        set_borders(t)
        for i, h in enumerate(headers):
            fill_cell(t.rows[0].cells[i], h, bold=True, size=size, center=True)
        for r, row in enumerate(rows, 1):
            for c, val in enumerate(row):
                fill_cell(t.rows[r].cells[c], val, bold=(c == 0), size=size)


def set_borders(table):
    tblPr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), "000000")
        borders.append(el)
    tblPr.append(borders)


def fill_cell(cell, text, bold=False, size=BODY_PT, center=False):
    p = cell.paragraphs[0]
    clear_runs(p)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    style_run(p.add_run(text), bold=bold, size=size)


def ensure_trailing_paragraph(cell):
    if cell._tc[-1].tag != qn("w:p"):
        cell._tc.append(OxmlElement("w:p"))


def reset_cell(cell, keep=1):
    """Keep the first `keep` paragraphs (the label) and drop instruction paragraphs."""
    for p in cell.paragraphs[keep:]:
        remove(p)


# ---------------------------------------------------------------- diagram

def draw_block_diagram(path):
    W, H = 1500, 860
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    f = ImageFont.truetype(font_path, 22)
    fb = ImageFont.truetype(bold_path, 24)

    def box(x, y, w, h, title, lines, fill):
        d.rounded_rectangle([x, y, x + w, y + h], radius=14, outline="black", width=3, fill=fill)
        tw = d.textlength(title, font=fb)
        d.text((x + (w - tw) / 2, y + 12), title, font=fb, fill="black")
        for i, line in enumerate(lines):
            lw = d.textlength(line, font=f)
            d.text((x + (w - lw) / 2, y + 50 + i * 28), line, font=f, fill="black")

    def arrow(x1, y1, x2, y2):
        d.line([x1, y1, x2, y2], fill="black", width=3)
        import math
        a = math.atan2(y2 - y1, x2 - x1)
        s = 14
        d.polygon([
            (x2, y2),
            (x2 - s * math.cos(a - 0.4), y2 - s * math.sin(a - 0.4)),
            (x2 - s * math.cos(a + 0.4), y2 - s * math.sin(a + 0.4)),
        ], fill="black")

    box(500, 20, 500, 110, "USER (Web Browser)", ["Company / idea / founder inputs", "Analyze | Simulate | Learn pages"], "#DDEBF7")
    box(500, 200, 500, 110, "Node.js API Server", ["REST endpoints, caching,", "validation, static frontend"], "#FCE4D6")
    arrow(750, 130, 750, 200)

    box(30, 390, 440, 160, "ANALYZE Module", ["Wikipedia / Wikidata", "Open CSV datasets, Product Hunt", "Yahoo Finance (public cos.)", "Idea signal extraction"], "#E2EFDA")
    box(530, 390, 440, 160, "SIMULATE Module", ["Startup agent state", "Scenario, founder, investor", "and stress engines", "Monthly decision ticks"], "#E2EFDA")
    box(1030, 390, 440, 160, "LEARN Module", ["Curriculum rounds & paths", "Quiz / XP / streaks", "Weakness detector", "Recommendation engine"], "#E2EFDA")
    for x in (250, 750, 1250):
        arrow(750, 310, x, 390)

    box(250, 630, 1000, 100, "Hybrid Intelligence Layer", ["Local ML (XGBoost success predictor)  +  optional Gemini coaching"], "#FFF2CC")
    for x in (250, 750, 1250):
        arrow(x, 550, x if x == 750 else (400 if x < 750 else 1100), 630)

    box(450, 765, 600, 80, "Dashboards & Reports", ["SWOT, KPIs, metric charts, coach notes"], "#DDEBF7")
    arrow(750, 730, 750, 765)
    img.save(path)


# ---------------------------------------------------------------- content

def fill_part_a(doc):
    t = doc.tables[0]
    reset_cell(t.rows[0].cells[0])
    set_label_value(t.rows[1].cells[-1].paragraphs[0], "Project Title:", TITLE)
    reset_cell(t.rows[1].cells[-1])
    set_label_value(t.rows[2].cells[-1].paragraphs[0], "Keywords (5–8):", KEYWORDS)
    reset_cell(t.rows[2].cells[-1])

    theme = t.rows[3].cells[-1]
    ps = theme.paragraphs
    for p in ps[1:7]:
        remove(p)
    set_label_value(ps[7], "Theme No.:", THEME_NO)
    set_label_value(ps[8], "Theme Name:", THEME_NAME)
    set_label_value(ps[9], "3. Sub-theme / Focus Area:", SUB_THEME)

    guide = t.rows[5].cells[-1].paragraphs
    set_label_value(guide[1], "Project Guide Name:", "")
    for p in guide[6:]:
        remove(p)

    # Student-details note row (reference proposal drops it)
    note_row = doc.tables[2].rows[0]
    note_row._tr.getparent().remove(note_row._tr)


def fill_part_b(doc):
    rows = doc.tables[3].rows

    # 8. Background
    c = rows[1].cells[-1]
    set_label_value(c.paragraphs[0], "Background and Need of the Project:", "")
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.para(
        "India has one of the world’s largest startup ecosystems, and Karnataka — with Bengaluru as its hub — "
        "hosts a large share of the country’s new ventures and student-founded startups. Yet most early-stage "
        "ventures fail within their first few years, commonly due to poor idea validation, premature scaling, cash "
        "mismanagement and weak founder decision-making. Students and first-time founders usually learn these "
        "lessons only after committing scarce money, time and equity."
    )
    w.para(
        "Existing support is fragmented: business-plan templates and generic online courses teach theory, "
        "commercial market-intelligence tools are expensive and built for analysts, and incubator mentoring is "
        "limited in reach. None of these lets a founder validate an idea against real data, rehearse month-by-month "
        "decisions safely, and then strengthen weak skills in one place."
    )
    w.para(
        "Startup Sandbox addresses this need with an AI-powered web platform of three connected modules: Analyze "
        "(company and idea intelligence from open data with ML-based scoring), Simulate (a founder decision digital "
        "twin that tracks cash, runway, users, revenue, morale, stress, dilution and investor interest every month) "
        "and Learn (an adaptive Founder Academy). Beneficiaries include engineering/MBA/MCA students, campus "
        "incubators and entrepreneurship cells, first-time founders and faculty teaching entrepreneurship."
    )

    # 9. Review of existing work
    c = rows[2].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.para(
        "A review of existing tools and literature shows that business analysis, startup simulation and "
        "entrepreneurship learning are mostly addressed in isolation:"
    )
    w.numbered(1, "Commercial databases and BI dashboards (e.g., Crunchbase, CB Insights, Tracxn) provide "
               "company profiles and funding data, but are subscription-based, analyst-oriented and do not evaluate "
               "a raw student idea or recommend next steps [6].", "Market-intelligence platforms")
    w.numbered(2, "Classroom business games and spreadsheet-based models simulate cash burn, hiring and "
               "fundraising, but are largely scripted, rarely use trained ML models for success probability, and "
               "give limited personalised feedback after each decision.", "Startup / business simulation games")
    w.numbered(3, "Lean Startup and Customer Development methods [1], [2] and the Business Model Canvas [3] "
               "give strong frameworks but are applied manually through workshops and mentors; digital lean "
               "approaches are discussed in [5].", "Entrepreneurship frameworks")
    w.numbered(4, "Gradient-boosting models such as XGBoost [4] and other ML techniques have been used to "
               "predict startup success and funding outcomes from structured data [7], but are generally "
               "research prototypes, not interactive tools for founders.", "ML-based startup success prediction")
    w.numbered(5, "Adaptive learning systems personalise content using learner models [9], but "
               "entrepreneurship content is rarely linked to performance in a realistic decision simulation.",
               "Adaptive learning platforms")
    w.rich([("Research gap identified: ", True),
            ("No reviewed system combines (a) open-data company/idea analysis with ML scoring, (b) a multi-engine "
             "monthly founder decision simulation and (c) an adaptive curriculum that responds to learner weaknesses, "
             "in a low-cost platform that students and incubators can deploy themselves.", False)])
    w.caption("Table I: Comparison of Startup Sandbox with existing approaches")
    w.table(
        ["Feature", "BI / market-data platforms", "Business simulation games", "Online courses", "Proposed Startup Sandbox"],
        [
            ["Raw idea evaluation", "No", "No", "No", "Yes (signals + peer matching + ML score)"],
            ["Company analysis (SWOT, model, moat)", "Yes", "No", "No", "Yes, from open data"],
            ["ML success prediction", "Limited", "Rule-based", "No", "Yes (XGBoost-based)"],
            ["Monthly decision simulation", "No", "Yes (scripted)", "No", "Yes (multi-engine, hidden state)"],
            ["Personalised coaching", "No", "Limited", "Limited", "Yes (coach notes + AI feedback)"],
            ["Adaptive curriculum", "No", "No", "Partial", "Yes (weak-skill based)"],
            ["Cost to student", "High (subscription)", "Medium", "Low–Medium", "Low (open data, self-hosted)"],
        ],
    )

    # 10. Problem statement
    c = rows[3].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.para("Student and first-time founders currently face four connected problems:")
    w.numbered(1, "Ideas are judged by intuition or generic templates, without comparison to similar successful "
               "and failed startups or any quantified risk score.", "No structured idea validation")
    w.numbered(2, "Decisions on burn rate, hiring, pricing and fundraising are learned only after real money and "
               "equity are lost.", "No safe way to rehearse decisions")
    w.numbered(3, "Courses teach concepts separately from practice, so weaknesses in finance, customer "
               "research or leadership are not identified.", "Disconnected learning")
    w.numbered(4, "Quality analysis tools and mentors are costly and concentrated in a few incubators.",
               "Limited access to expert guidance")
    w.para(
        "This project proposes to design and develop Startup Sandbox, a unified AI-powered platform that validates "
        "startup ideas, simulates founder decisions month by month and adaptively teaches entrepreneurship skills."
    )

    # 11. Objectives
    c = rows[4].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    objectives = [
        "To design a modular web platform with three modules — Analyze, Simulate and Learn — using a Node.js "
        "backend, Python ML engines and a browser-based dashboard.",
        "To develop a company-analysis module that combines Wikipedia/Wikidata, open startup datasets, Product Hunt "
        "launch data and Yahoo Finance (for listed companies) to produce business model, marketing, competitive moat, "
        "key metrics and SWOT outputs.",
        "To develop an idea-analysis module that extracts customer, revenue-model and channel signals, matches "
        "similar successful and failed startups, and produces an ML-based opportunity score with a clear "
        "recommendation (e.g., validate, niche down, rebuild the angle).",
        "To build a founder decision simulator (up to 24 months) in which each monthly decision updates cash, "
        "runway, users, revenue, retention, equity, team morale, founder stress, investor interest and technical debt.",
        "To train and integrate an XGBoost-based success-probability model and evaluate its accuracy on held-out "
        "startup data, reporting measured results.",
        "To develop an adaptive Founder Academy with curriculum rounds, quizzes, XP/streaks, weak-skill detection "
        "and personalised module recommendations.",
        "To evaluate the platform for response time, output quality on sample companies and ideas, simulation "
        "consistency and user feedback from a pilot group of students.",
        "To document the system and prepare a standard operating procedure for use by entrepreneurship cells "
        "and incubators.",
    ]
    for i, o in enumerate(objectives, 1):
        w.numbered(i, o)

    # 12. Innovation
    c = rows[5].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.bullet("Unlike separate BI tools, games and courses, Startup Sandbox links idea/company analysis to a "
             "decision simulation and then to personalised learning in one workflow.",
             "Unified Analyze → Simulate → Learn loop")
    w.bullet("Scoring and success probability run on local ML models (XGBoost) for fast, low-cost and repeatable "
             "results, while generative AI is used only to enrich explanations and coaching.",
             "Hybrid local ML + generative AI")
    w.bullet("The simulator tracks both visible metrics (cash, runway, users) and hidden factors (investor "
             "confidence, burnout, market hype, product quality), producing realistic cascading consequences.",
             "Founder digital twin with hidden state")
    w.bullet("After each decision, the system contrasts a typical beginner choice with an experienced founder’s "
             "choice and explains why, turning every mistake into a lesson.", "Decision-level coaching")
    w.bullet("Weak-skill detection and sector affinity drive the next recommended modules instead of a fixed "
             "syllabus.", "Adaptive curriculum")
    w.bullet("Built on open data sources and open-source tools, the platform can be self-hosted by any college "
             "at minimal cost.", "Open-data, low-cost deployment")

    # 13. Methodology
    c = rows[6].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.rich([("Overall methodology: ", True),
            ("The project follows an iterative development approach: requirement study with student founders and "
             "incubator mentors → system design → module-wise development (Analyze, Simulate, Learn) → ML model "
             "training and integration → testing and pilot validation → documentation.", False)])
    w.head("Block diagram:")
    w.image(DIAGRAM, 5.6)
    w.caption("Fig. 1: Block diagram of the Startup Sandbox platform")
    w.rich([("System architecture: ", True),
            ("A browser frontend (HTML/CSS/JavaScript with Chart.js) communicates with a Node.js REST API server. "
             "The server calls open-data adapters (Wikipedia, Wikidata, Product Hunt, Yahoo Finance, CSV datasets) "
             "and Python engines for ML scoring, simulation and learning. Results are returned as structured JSON and "
             "shown as dashboards, charts and coach notes. Generative AI (Gemini) is optional and used only to "
             "enrich explanations.", False)])
    w.rich([("Design approach: ", True), ("", False)])
    for i, s in enumerate([
        "Analyze: collect and clean data from open sources; extract idea signals; match peers; compute confidence, "
        "clarity and data-depth scores; generate SWOT and recommendations.",
        "Simulate: initialise startup state from founder constraints (money, burn, team, founder type) and idea "
        "attributes; apply monthly dynamics, random events and decision effects through scenario, founder, "
        "investor and stress engines; update ML success probability.",
        "Learn: define curriculum rounds and sector paths; track quiz results, XP and streaks; detect weak skills; "
        "recommend next modules.",
        "Integrate all modules through REST APIs and a common dashboard.",
    ], 1):
        w.numbered(i, s)
    w.rich([("Experimental plan: ", True),
            ("(i) Train and test the XGBoost model on startup datasets and report accuracy/precision/recall; "
             "(ii) test Analyze on a set of known companies and student ideas and review output quality; "
             "(iii) run simulations with different founder profiles and decision paths and check metric consistency "
             "(e.g., runway vs. cash and burn); (iv) measure API response times; (v) conduct a pilot with student "
             "users and collect feedback through a structured questionnaire.", False)])
    w.rich([("Software / hardware to be used: ", True), ("", False)])
    w.bullet("Node.js, JavaScript, HTML/CSS, Chart.js, Python 3, XGBoost, scikit-learn, pandas, Google Gemini API "
             "(optional), Git, Visual Studio Code.", "Software")
    w.bullet("Laptops/desktop computers with internet access; a lab PC or low-cost cloud instance for hosting the "
             "pilot.", "Hardware")

    # 14. Deliverables
    c = rows[7].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.bullet("Working Startup Sandbox platform with Analyze, Simulate and Learn modules.", "Prototype / Web Portal")
    w.bullet("Node.js API server, Python ML/simulation/learning engines and trained XGBoost model.", "Software")
    w.bullet("Idea scoring, SWOT analysis and month-by-month founder coaching.", "Decision Support Tool")
    w.bullet("Sustainability plan for offering the platform to colleges and incubators (freemium / institutional "
             "licence).", "Business Model")
    w.bullet("Step-by-step guide for installing and using the platform in entrepreneurship cells.",
             "Standard Operating Procedure")
    w.head("Standard operating procedure:")
    for i, s in enumerate([
        "Install Node.js and Python dependencies and start the server.",
        "Open the platform in a web browser.",
        "Analyze: enter a company name or describe a startup idea and review the report.",
        "Simulate: enter founder constraints and startup details, then take monthly decisions and review metrics "
        "and coach notes.",
        "Learn: complete recommended modules and quizzes; review weak skills and next recommendations.",
        "Export or record results for mentoring sessions and reports.",
    ], 1):
        w.numbered(i, s)

    # 15. Outcomes and impact
    c = rows[8].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    for label, text in [
        ("Technical", "A tested platform combining open-data analytics, ML-based success prediction, decision "
         "simulation and adaptive learning, with measured model accuracy and response times."),
        ("Social", "Gives students from all backgrounds, including tier-2/tier-3 colleges, free or low-cost access to "
         "startup guidance that is otherwise limited to a few incubators."),
        ("Environmental", "A fully digital tool that reduces printed workbooks and travel for workshops; no hardware "
         "waste is generated."),
        ("Economic", "Helps founders avoid costly early mistakes (overspending, premature scaling, weak positioning) "
         "before investing real money; benefits will be assessed through pilot feedback."),
        ("Industrial", "Can be used by incubators, accelerators and entrepreneurship cells to screen ideas and train "
         "cohorts, supporting the Karnataka startup ecosystem."),
        ("Academic", "Serves as a teaching aid for entrepreneurship and innovation courses and as a research platform "
         "for ML and decision simulation."),
        ("Potential users", "Engineering, MBA and MCA students, college entrepreneurship cells, incubators, aspiring "
         "founders and faculty."),
    ]:
        w.bullet(text, label)

    # 16. Relevance
    c = rows[9].cells[-1]
    ticks = {"SDGs", "Karnataka Priority Sector", "MSME", "Digital India", "Startup"}
    for p in c.paragraphs:
        if "□" in p.text and any(k in p.text for k in ticks):
            for r in p.runs:
                if "□" in r.text:
                    r.text = r.text.replace("□", "✓")
                    break

    # 17. Work plan
    wp = rows[10].cells[-1].tables[0]
    plan = {1: [1], 2: [1, 2], 3: [2, 3, 4], 4: [3, 4], 5: [4, 5], 6: [5]}
    for r, months in plan.items():
        for m in months:
            fill_cell(wp.rows[r].cells[m], "✓", bold=True, center=True)

    # 18. Facilities (institution-specific; generic software-project entries)
    c = rows[11].cells[-1]
    for p in c.paragraphs[1:]:
        if p.text.strip():
            remove(p)
    fac = c.tables[0]
    for r, text in enumerate([
        "Computer / software laboratory with internet access",
        "Desktop computers / laptops",
        "Node.js, Python 3, VS Code, Git (open source)",
        "NONE",
        "NONE",
        "Departmental laboratory access, Entrepreneurship / Innovation cell",
    ]):
        fill_cell(fac.rows[r].cells[1], text)

    # 19. Major requirements
    c = rows[12].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    w.head("Hardware")
    w.bullet("Laptop/desktop computers (available in the institution).")
    w.bullet("Low-cost cloud instance or lab PC for hosting the pilot.")
    w.head("Software")
    w.bullet("Python (XGBoost, scikit-learn, pandas), Node.js, JavaScript, Chart.js — open source.")
    w.bullet("Google Gemini API (optional, for AI explanations).")
    w.bullet("Domain name / hosting for pilot deployment.")
    w.head("Field Studies")
    w.bullet("Surveys and feedback sessions with student founders and incubator mentors.")

    # 20. Budget
    c = rows[13].cells[-1]
    for p in c.paragraphs[1:]:
        if p.text.strip():
            remove(p)
    bt = c.tables[0]
    for r, val in enumerate([
        "Rs. 0/-", "Rs. 500/-", "Rs. 0/-", "Rs. 5,000/-", "Rs. 1,000/-", "Rs. 1,000/-", "Rs. 500/-", "Rs. 8,000/-",
    ], 1):
        fill_cell(bt.rows[r].cells[1], val, bold=(r == 8))

    # 21. References
    c = rows[14].cells[-1]
    reset_cell(c)
    w = CellWriter(c, c.paragraphs[0])
    for ref in [
        "[1] E. Ries, The Lean Startup. New York, NY, USA: Crown Business, 2011.",
        "[2] S. Blank and B. Dorf, The Startup Owner’s Manual. Pescadero, CA, USA: K&S Ranch, 2012.",
        "[3] A. Osterwalder and Y. Pigneur, Business Model Generation. Hoboken, NJ, USA: Wiley, 2010.",
        "[4] T. Chen and C. Guestrin, “XGBoost: A scalable tree boosting system,” in Proc. 22nd ACM SIGKDD Int. "
        "Conf. Knowledge Discovery and Data Mining, 2016, pp. 785–794.",
        "[5] A. Ghezzi and A. Cavallo, “Agile business model innovation in digital entrepreneurship: Lean startup "
        "approaches,” Journal of Business Research, vol. 110, pp. 519–537, 2020.",
        "[6] CB Insights, “The top reasons startups fail,” Research Report, 2021.",
        "[7] A. Krishna, A. Agrawal and A. Choudhary, “Predicting the outcome of startups: Less failure, more "
        "success,” in Proc. IEEE 16th Int. Conf. Data Mining Workshops (ICDMW), 2016, pp. 798–805.",
        "[8] Department for Promotion of Industry and Internal Trade (DPIIT), “Startup India: States’ Startup "
        "Ranking and Ecosystem Report,” Government of India, 2024.",
        "[9] P. Brusilovsky and E. Millán, “User models for adaptive hypermedia and adaptive educational systems,” "
        "in The Adaptive Web, Berlin, Germany: Springer, 2007, pp. 3–53.",
        "[10] Government of Karnataka, “Karnataka Startup Policy 2022–2027,” Department of Electronics, IT, BT and "
        "S&T, Bengaluru, 2022.",
    ]:
        w.para(ref)

    # 22. Payment details — drop instructions, keep blank fields
    c = rows[15].cells[-1]
    for p in c.paragraphs[1:10]:
        remove(p)

    for row in rows:
        ensure_trailing_paragraph(row.cells[-1])


def trim_body(doc):
    """Remove instruction pages, Endorsement page and KSCST bank page (as in the reference)."""
    body = list(doc.element.body.iterchildren())
    drop = set(range(5, 36)) | {59, 112} | set(range(87, 111)) | set(range(119, 134))
    for i in sorted(drop, reverse=True):
        el = body[i]
        if el.tag == qn("w:p") and el.find(".//" + qn("w:sectPr")) is not None:
            continue
        el.getparent().remove(el)


def fill_declaration(doc):
    from docx.text.paragraph import Paragraph
    for p in doc.paragraphs:
        t = p.text
        if t.startswith("Title of the Project:"):
            set_label_value(p, "Title of the Project:", TITLE + ".", label_size=BODY_PT)
        elif t.startswith("Broad Theme:"):
            set_label_value(p, "Broad Theme:", "Artificial Intelligence, Data Science and Digital Technologies "
                            "(Theme 04).", label_size=BODY_PT)
        elif t.startswith("Sub-theme / Focus Area:"):
            set_label_value(p, "Sub-theme / Focus Area:", "AI and Machine Learning; Decision Support Systems; "
                            "Digital Twins, Modelling and Simulation.", label_size=BODY_PT)
        elif t.startswith("Department:"):
            set_label_value(p, "Department:", "", label_size=BODY_PT)
        elif t.startswith("Institution:"):
            set_label_value(p, "Institution:", "", label_size=BODY_PT)

    for t in doc.tables:
        if t.rows[0].cells[0].text.strip() == "TITLE OF THE PROJECT":
            fill_cell(t.rows[0].cells[2], TITLE)


def set_font(rpr):
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    for attr in list(fonts.attrib):
        if attr.endswith("Theme"):
            del fonts.attrib[attr]
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(attr), FONT)


def restyle(doc):
    """Match the reference: Cambria text, uppercase blue labels, rows that size to content."""
    for block in list(doc.element.body.iterchildren())[HEADER_BLOCKS:]:
        for r in block.iter(qn("w:r")):
            set_font(r.get_or_add_rPr())
            color = r.rPr.find(qn("w:color"))
            if color is not None and color.get(qn("w:val"), "").upper() == "0000FF":
                for t in r.iter(qn("w:t")):
                    t.text = t.text.upper()
        for ppr in block.iter(qn("w:pPr")):
            rpr = ppr.find(qn("w:rPr"))
            if rpr is not None:
                set_font(rpr)
    # Part A and SPP coordinator tables are filled in UPPERCASE per KSCST instructions.
    for table in (doc.tables[0], doc.tables[2]):
        for t in table._tbl.iter(qn("w:t")):
            t.text = t.text.upper()
    for tr in doc.element.body.iter(qn("w:tr")):
        trPr = tr.find(qn("w:trPr"))
        if trPr is not None:
            for h in trPr.findall(qn("w:trHeight")):
                trPr.remove(h)


def build():
    draw_block_diagram(DIAGRAM)
    doc = Document(str(TEMPLATE))
    # Fill tables before trimming so table indices match the template.
    fill_part_a(doc)
    fill_part_b(doc)
    trim_body(doc)
    fill_declaration(doc)
    for hl in list(doc.element.body.iter(qn("w:highlight"))):
        hl.getparent().remove(hl)
    restyle(doc)
    doc.save(str(OUT_DOCX))
    print(f"Wrote {OUT_DOCX}")


if __name__ == "__main__":
    build()
