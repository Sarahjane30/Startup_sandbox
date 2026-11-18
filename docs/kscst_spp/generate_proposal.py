#!/usr/bin/env python3
"""Generate filled KSCST SPP 50S proposal for Startup Sandbox (personal fields blank)."""

from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Inches, Pt, RGBColor, Cm


OUT_DIR = Path(__file__).resolve().parent
OUT_DOCX = OUT_DIR / "KSCST_SPP_50S_Proposal_Startup_Sandbox_FILLED.docx"


def set_run_font(run, size=11, bold=False, italic=False, name="Times New Roman"):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic


def add_para(doc, text="", *, size=11, bold=False, italic=False, center=False, space_after=6, space_before=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(space_before)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    else:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if text:
        run = p.add_run(text)
        set_run_font(run, size=size, bold=bold, italic=italic)
    return p


def add_rich(doc, parts, *, center=False, space_after=6, justify=True):
    """parts: list of (text, bold, italic, size)"""
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif justify:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    for text, bold, italic, size in parts:
        run = p.add_run(text)
        set_run_font(run, size=size, bold=bold, italic=italic)
    return p


def add_heading_line(doc, text):
    return add_para(doc, text, size=12, bold=True, center=True, space_after=8, space_before=10)


def shade_cell(cell, hex_color="D9E2F3"):
    tc = cell._tePr if hasattr(cell, "_tePr") else cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def set_cell_text(cell, text, *, bold=False, size=9, center=False):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold)


def add_table(doc, headers, rows, col_widths=None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        set_cell_text(table.rows[0].cells[i], h, bold=True, size=9, center=True)
        shade_cell(table.rows[0].cells[i], "D9E2F3")
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            set_cell_text(table.rows[r_idx + 1].cells[c_idx], val, size=9)
    if col_widths:
        for row in table.rows:
            for i, w in enumerate(col_widths):
                row.cells[i].width = Inches(w)
    doc.add_paragraph()
    return table


def blank(label="[TO BE FILLED BY APPLICANT]"):
    return label


def build():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)

    # Header
    add_para(doc, "KARNATAKA STATE COUNCIL FOR SCIENCE AND TECHNOLOGY", size=13, bold=True, center=True, space_after=2)
    add_para(doc, "Indian Institute of Science campus, Bengaluru – 560 012", size=10, center=True, space_after=2)
    add_para(
        doc,
        "Telephone: 080 – 23341652, 23348849 || Email: spp@kscst.org.in",
        size=10,
        center=True,
        space_after=2,
    )
    add_para(
        doc,
        "Website: www.kscst.org.in/spp.html or https://kscst.karnataka.gov.in/en",
        size=10,
        center=True,
        space_after=8,
    )
    add_para(
        doc,
        "50th SERIES OF STUDENT PROJECT PROGRAMME (SPP): 2026–2027",
        size=12,
        bold=True,
        center=True,
        space_after=4,
    )
    add_para(
        doc,
        "PROJECT PROPOSAL — STARTUP SANDBOX",
        size=11,
        bold=True,
        center=True,
        space_after=4,
    )
    add_para(
        doc,
        "Note: Personal, institutional contact, guide, student, SPP coordinator, signature, and payment fields are intentionally left blank for the applicant to complete.",
        size=9,
        italic=True,
        center=True,
        space_after=12,
    )

    # PART A
    add_heading_line(doc, "PART–A: GENERAL INFORMATION")
    add_para(doc, "(Please fill in all details in UPPERCASE LETTERS, except for the Email ID.)", size=10, italic=True, center=True)

    add_rich(
        doc,
        [
            ("1. PROJECT TITLE: ", True, False, 11),
            (
                "DESIGN AND DEVELOPMENT OF STARTUP SANDBOX: AN AI-POWERED PLATFORM FOR STARTUP VALIDATION, FOUNDER DECISION SIMULATION, AND ADAPTIVE ENTREPRENEURSHIP LEARNING",
                False,
                False,
                11,
            ),
        ],
    )
    add_rich(
        doc,
        [
            ("2. KEYWORDS: ", True, False, 11),
            (
                "STARTUP VALIDATION, XGBOOST, GENERATIVE AI, FOUNDER DECISION SIMULATION, ADAPTIVE LEARNING, BUSINESS INTELLIGENCE, DIGITAL TWIN, ENTREPRENEURSHIP EDUCATION",
                False,
                False,
                11,
            ),
        ],
    )
    add_rich(
        doc,
        [
            ("3. BROAD THEME:\n", True, False, 11),
            ("1. THEME NO: ", True, False, 11),
            ("04\n", False, False, 11),
            ("2. THEME NAME: ", True, False, 11),
            ("ARTIFICIAL INTELLIGENCE, DATA SCIENCE AND DIGITAL TECHNOLOGIES\n", False, False, 11),
            ("3. SUB-THEME / FOCUS AREA: ", True, False, 11),
            (
                "ARTIFICIAL INTELLIGENCE (AI) AND MACHINE LEARNING (ML); DECISION SUPPORT SYSTEMS AND INTELLIGENT INFORMATION SYSTEMS; DIGITAL TWINS, MODELLING AND SIMULATION; AI, DATA ANALYTICS AND DIGITAL TECHNOLOGIES FOR EDUCATION AND ENTREPRENEURSHIP",
                False,
                False,
                11,
            ),
        ],
    )

    add_rich(
        doc,
        [
            ("4. INSTITUTION DETAILS:\n", True, False, 11),
            ("1. NAME OF INSTITUTION: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("2. COURSE NAME: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("3. DEPARTMENT NAME: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("4. AFFILIATED UNIVERSITY: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("5. DISTRICT OF YOUR INSTITUTION: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("6. COMPLETE POSTAL ADDRESS OF THE INSTITUTION WITH PIN CODE: ", True, False, 11),
            (f"{blank()}", False, False, 11),
        ],
    )

    add_rich(
        doc,
        [
            ("5. PROJECT GUIDE DETAILS:\n", True, False, 11),
            ("1. PROJECT GUIDE NAME: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("2. PROJECT GUIDE DESIGNATION: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("3. PROJECT GUIDE DEPARTMENT: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("4. PROJECT GUIDE EMAIL ID: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("5. PROJECT GUIDE MOBILE NUMBER: ", True, False, 11),
            (f"{blank()}", False, False, 11),
        ],
    )

    add_para(doc, "6. STUDENT TEAM DETAILS:", size=11, bold=True)
    add_table(
        doc,
        [
            "Sl. No.",
            "Photograph",
            "Name of the Student (BLOCK LETTERS)",
            "USN / Registration No.",
            "Degree & Branch & Semester",
            "Category (SC/ST/OBC/General)",
            "Mobile No.",
            "Email Id",
        ],
        [
            ["1.", blank("—"), blank(), blank(), "Degree:\nBranch:\nSemester:", blank(), blank(), blank()],
            ["2.", blank("—"), blank(), blank(), "Degree:\nBranch:\nSemester:", blank(), blank(), blank()],
            ["3.", blank("—"), blank(), blank(), "Degree:\nBranch:\nSemester:", blank(), blank(), blank()],
            ["4.", blank("—"), blank(), blank(), "Degree:\nBranch:\nSemester:", blank(), blank(), blank()],
        ],
    )
    add_para(
        doc,
        "Indicate the Team Leader by adding “(TEAM LEADER)” against the respective student’s name. Maximum four students.",
        size=9,
        italic=True,
    )

    add_rich(
        doc,
        [
            ("7. SPP COORDINATOR DETAILS:\n", True, False, 11),
            ("1. SPP COORDINATOR NAME: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("2. SPP COORDINATOR DESIGNATION: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("3. SPP COORDINATOR EMAIL: ", True, False, 11),
            (f"{blank()}\n", False, False, 11),
            ("4. SPP COORDINATOR MOBILE NUMBER: ", True, False, 11),
            (f"{blank()}", False, False, 11),
        ],
    )

    # PART B
    add_heading_line(doc, "PART – B: PROJECT DESCRIPTION")

    add_para(doc, "8. BACKGROUND AND NEED OF THE PROJECT:", size=11, bold=True)
    add_para(
        doc,
        "India’s startup ecosystem has expanded rapidly, yet a large share of early-stage ventures fail because founders "
        "lack structured ways to validate ideas, understand competitive context, rehearse high-stakes decisions, and "
        "learn entrepreneurship skills before committing scarce capital. Existing practice still depends on generic "
        "business-plan templates, expensive consulting, fragmented online courses, and delayed mentor feedback. "
        "These approaches rarely combine live market intelligence, quantitative success-risk scoring, month-by-month "
        "decision simulation, and adaptive learning in one accessible platform.",
    )
    add_para(
        doc,
        "Startup Sandbox addresses this gap as an integrated web platform with three tightly coupled modules: "
        "(1) Analyze — company and idea intelligence using Wikipedia/Wikidata, open startup datasets, Product Hunt "
        "signals, optional Yahoo Finance enrichment, and a hybrid local ML + generative-AI pipeline; "
        "(2) Simulate — a founder decision digital twin that advances monthly state variables such as cash, runway, "
        "users, revenue, retention, dilution, morale, founder stress, investor interest, and technical debt; and "
        "(3) Learn — a Founder Academy with curriculum rounds, XP/streak progression, weakness detection, sector "
        "affinity, and recommendation engines. The need is strongest among college founders, first-time "
        "entrepreneurs, incubators, and entrepreneurship classrooms that require low-cost, evidence-guided practice "
        "before real-world capital is placed at risk.",
    )

    add_para(doc, "9. REVIEW OF EXISTING WORK:", size=11, bold=True)
    add_para(
        doc,
        "Prior work spans business-intelligence dashboards, startup simulators, and adaptive e-learning, but typically "
        "in isolation rather than as one founder workflow.",
    )
    add_para(
        doc,
        "1. Business intelligence and competitive analysis: Commercial tools and research systems summarize company "
        "profiles, SWOT, and market positioning from public web sources. While useful for desk research, they seldom "
        "produce actionable go/no-go decisions for raw early-stage ideas, nor do they couple analysis outputs to "
        "simulation and personalized learning paths.",
        space_after=4,
    )
    add_para(
        doc,
        "2. Startup / business simulation games: Educational simulators model cash burn, hiring, and fundraising "
        "choices. Many are rule-heavy and scenario-scripted, with limited use of trained ML models for success "
        "probability, weak linkage to live market data, and minimal adaptive coaching after each decision.",
        space_after=4,
    )
    add_para(
        doc,
        "3. Adaptive learning and skill platforms: MOOCs and edtech systems personalize content using quizzes and "
        "progress metrics. Entrepreneurship-specific systems rarely integrate decision-consequence feedback from a "
        "live simulation state, so learners practice concepts without experiencing runway, dilution, or stress trade-offs.",
        space_after=4,
    )
    add_para(
        doc,
        "4. Predictive ML for venture outcomes: Academic literature applies logistic models, random forests, and "
        "gradient boosting to funding/survival prediction from structured features. These models are powerful for "
        "batch research but are infrequently packaged as interactive founder tools with transparent decision coaching.",
        space_after=4,
    )
    add_para(
        doc,
        "Research gap identified: No low-cost student-deployable system found in the reviewed space that simultaneously "
        "(a) analyzes companies/ideas with hybrid public-data + local XGBoost/Gemini intelligence, "
        "(b) runs a multi-engine monthly founder simulation with visible and hidden state, and "
        "(c) adapts a structured entrepreneurship curriculum from simulation and learning performance. "
        "Startup Sandbox targets this integrated gap.",
    )

    add_para(doc, "Table I: Comparative benchmarking of proposed system with prior approaches.", size=10, italic=True)
    add_table(
        doc,
        ["Feature / Parameter", "BI Dashboards", "Startup Sim Games", "EdTech Courses", "Proposed Startup Sandbox"],
        [
            ["Company/idea analysis", "Yes (company)", "Limited", "No", "Yes (company + raw idea)"],
            ["Live public data fusion", "Partial", "Rare", "No", "Wikipedia, Wikidata, CSV, Product Hunt, Yahoo"],
            ["ML success scoring", "Rare", "Rule-based", "No", "Hybrid XGBoost + local engines"],
            ["Generative coaching", "Limited", "Limited", "Partial", "Gemini-assisted idea/sim feedback"],
            ["Monthly decision twin", "No", "Yes", "No", "Yes (cash, runway, stress, dilution, etc.)"],
            ["Adaptive founder curriculum", "No", "No", "Yes", "Yes (XP, weak skills, recommendations)"],
            ["End-to-end Analyze→Simulate→Learn loop", "No", "Partial", "No", "Yes"],
            ["Estimated deployment cost", "High (SaaS)", "Medium", "Medium", "Low (self-hosted Node + Python)"],
        ],
    )

    add_para(doc, "10. PROBLEM STATEMENT:", size=11, bold=True)
    add_para(
        doc,
        "Early-stage founders and entrepreneurship students face four interconnected failures:",
    )
    add_para(
        doc,
        "1. Unstructured idea validation: Ideas are judged through intuition or generic templates without comparable "
        "success/failure peers, sector signals, or quantified decision guidance.",
        space_after=4,
    )
    add_para(
        doc,
        "2. Absence of safe decision rehearsal: Critical choices on burn rate, hiring, fundraising, and product focus "
        "are learned only after irreversible capital or equity loss.",
        space_after=4,
    )
    add_para(
        doc,
        "3. Fragmented skill development: Courses teach theory separately from consequence-bearing practice, so weak "
        "skills in finance, customer research, or resilience are not diagnosed against simulated outcomes.",
        space_after=4,
    )
    add_para(
        doc,
        "4. High cost / low accessibility of mentoring: Quality analysis and coaching remain concentrated in "
        "incubators and paid advisors, leaving many student founders without an always-available practice environment.",
        space_after=4,
    )
    add_para(
        doc,
        "This project resolves these challenges by designing and developing Startup Sandbox — a unified AI-powered "
        "web platform for startup analysis, founder decision simulation, and adaptive entrepreneurship learning.",
    )

    add_para(doc, "11. OBJECTIVES:", size=11, bold=True)
    objectives = [
        "Design and implement a web application (Startup Sandbox) with three primary modules — Analyze, Simulate, and Learn — served by a Node.js backend and Python ML engines.",
        "Develop company-analysis pipelines that fuse Wikipedia/Wikidata summaries, open CSV startup datasets, Product Hunt launch signals, and optional Yahoo Finance enrichment into business-model, marketing, moat, metrics, and SWOT outputs.",
        "Build an idea-analysis service that extracts customer/revenue/channel signals, matches similar success and failure cases, scores opportunity quality with a local hybrid ML worker, and generates decision recommendations (for example: niche down, validate aggressively, or reinvent).",
        "Implement a founder decision simulator that initializes startup state from founder constraints and idea attributes, then advances month-by-month with cash, runway, users, revenue, retention, equity/dilution, team, stress, morale, investor interest, and technical-debt dynamics.",
        "Integrate multi-engine simulation logic (startup agent, probability/XGBoost predictor, scenario, founder, investor, and stress engines) and evaluate decision consequences with coach notes distinguishing beginner versus smart choices.",
        "Develop the Founder Academy learning system with universal rounds and sector paths, lesson delivery, quiz/submission handling, XP/streak/level progression, weakness detection, sector affinity, achievements, and recommendation outputs.",
        "Expose REST API endpoints for health, analyze, analyze-idea, product-hunt, lesson, learning, simulate, and simulate/decision, and validate end-to-end workflows through the browser UI.",
        "Document architecture, evaluation results (latency, analysis quality samples, simulation consistency, learning adaptation behavior), and a standard operating procedure for classroom or incubator deployment.",
    ]
    for i, obj in enumerate(objectives, 1):
        add_para(doc, f"{i}. {obj}", space_after=4)

    add_para(doc, "12. INNOVATION / NOVELTY:", size=11, bold=True)
    novelties = [
        "Unified Analyze → Simulate → Learn loop: Unlike standalone BI tools, games, or course platforms, Startup Sandbox connects market/idea intelligence to consequence-bearing monthly decisions and then to adaptive skill recommendations in one product surface.",
        "Hybrid local ML + generative AI intelligence: Opportunity scoring and simulation probability use local Python/XGBoost-style engines for deterministic, low-cost inference, while Gemini-assisted feedback improves narrative coaching without replacing core scoring.",
        "Founder digital twin with visible and hidden state: The simulator tracks operator-facing metrics and latent variables (investor confidence, burnout, market hype, product quality), enabling richer coaching than cash-only spreadsheets.",
        "Adaptive entrepreneurship curriculum grounded in performance: Weak-skill detection, sector affinity, and recommendation engines personalize the learning path from learner state rather than a fixed linear syllabus.",
        "Open-data first, low unit cost: Public knowledge sources and CSV datasets reduce proprietary data lock-in and keep the system deployable on institutional hardware for student teams and incubators.",
    ]
    for item in novelties:
        add_para(doc, f"• {item}", space_after=4)

    add_para(doc, "13. PROPOSED METHODOLOGY:", size=11, bold=True)
    add_para(doc, "Overall methodology:", size=11, bold=True, space_after=2)
    add_para(
        doc,
        "The project follows an iterative software-engineering methodology: requirements from founder workflows → "
        "modular architecture → implementation of analysis/simulation/learning engines → API integration → UI "
        "dashboards → controlled evaluation → documentation. Public data sources and local ML models are preferred "
        "so the platform remains usable with limited cloud spend.",
    )
    add_para(doc, "System architecture:", size=11, bold=True, space_after=2)
    add_para(
        doc,
        "Frontend: static HTML/CSS/JS pages for Analyze (index), Simulate, and Learn, with Chart.js visualizations. "
        "Backend: Node.js HTTP server exposing REST APIs. Analysis services call live-data adapters and idea/ML "
        "workers. Simulation and learning invoke Python engines through process bridges. Persistence for learning "
        "progress can use browser/local state and server-side session payloads as implemented in the MVP.",
    )
    add_para(doc, "Design approach:", size=11, bold=True, space_after=2)
    add_para(
        doc,
        "1) Implement and harden company/idea analysis modules. 2) Calibrate simulation initial conditions and monthly "
        "tick logic. 3) Wire learning curriculum metadata, adaptive analyzers, and recommendations. 4) Integrate "
        "frontend workflows and status feedback. 5) Evaluate with sample companies, ideas, and multi-month decision "
        "paths. 6) Package SOP and proposal evidence.",
    )
    add_para(doc, "Block diagram / flow chart (textual):", size=11, bold=True, space_after=2)
    add_para(
        doc,
        "User Input (company / idea / founder constraints) → API Gateway (Node.js) → "
        "[Live Data Adapters | Idea Signal Extractor | Simulation State Engine | Learning Engine] → "
        "[Hybrid ML Worker (XGBoost/local) + Optional Gemini Coaching] → "
        "Structured JSON Response → Web Dashboard (SWOT/KPIs / Monthly Metrics / Curriculum Progress).",
    )
    add_para(doc, "Experimental plan:", size=11, bold=True, space_after=2)
    add_para(
        doc,
        "Test Analyze on representative companies and raw ideas; measure response completeness and confidence/clarity/depth "
        "indicators. Run Simulate for up to 24 months with varied founder constraints and decision sequences; check state "
        "consistency (runway vs burn/cash) and coaching usefulness. Exercise Learn modules for curriculum unlock, quiz "
        "submit, weak-skill updates, and recommendations. Record API latency and failure/fallback behavior when live "
        "sources time out.",
    )
    add_para(doc, "Software / hardware to be used:", size=11, bold=True, space_after=2)
    add_para(
        doc,
        "Software: Node.js, Python 3, XGBoost / scikit-learn style models, Chart.js, Visual Studio Code / Cursor, Git, "
        "optional Google Gemini API for coaching enrichment, HTML/CSS/JS frontend. "
        "Hardware: Standard laboratory PCs / laptops with internet access; no specialized sensors required.",
    )

    add_para(doc, "14. EXPECTED DELIVERABLES:", size=11, bold=True)
    add_para(doc, "Expected output", size=11, bold=True, space_after=2)
    for item in [
        "Prototype web platform: Startup Sandbox (Analyze, Simulate, Learn).",
        "Software: Node.js API server, Python ML/simulation/learning engines, frontend dashboards.",
        "Decision support tool: idea scoring, SWOT/business intelligence, and monthly founder coaching notes.",
        "Learning system: curriculum rounds, adaptive recommendations, XP/achievement progress.",
        "Documentation: architecture notes, evaluation results, and standard operating procedure.",
    ]:
        add_para(doc, f"• {item}", space_after=2)

    add_para(doc, "Standard operating procedure", size=11, bold=True, space_after=2)
    for i, step in enumerate(
        [
            "Install Node.js dependencies and ensure Python engines/models are available on the host.",
            "Start the server (`npm start` / node server) and open the local web URL.",
            "Use Analyze to evaluate a company name or submit a startup idea; review SWOT, metrics, and recommendations.",
            "Configure founder constraints and startup attributes in Simulate; run monthly decisions and inspect metric trajectories.",
            "Complete Learn modules; verify XP/streak updates and recommendation changes after submissions.",
            "Record sample outputs, latency, and any fallback behavior for the project report.",
            "For classroom use, provide a short briefing on interpreting scores as decision support—not guaranteed investment advice.",
        ],
        1,
    ):
        add_para(doc, f"{i}. {step}", space_after=2)

    add_para(doc, "15. EXPECTED OUTCOMES AND IMPACT:", size=11, bold=True)
    impacts = [
        ("Technical impact", "A working hybrid AI platform demonstrating public-data fusion, local ML scoring, generative coaching, multi-engine simulation, and adaptive learning APIs."),
        ("Social impact", "Low-cost practice environment for student founders and first-time entrepreneurs to rehearse decisions before risking real capital or equity."),
        ("Economic impact", "May reduce avoidable early mistakes (over-hiring, premature scaling, weak positioning) by improving pre-venture learning; quantified savings should be reported only after pilot evaluation."),
        ("Environmental impact", "Primarily digital; reduces need for paper worksheets and repeated physical workshop materials. No significant negative environmental footprint expected beyond standard computing energy use."),
        ("Industrial / ecosystem impact", "Useful for college incubators, entrepreneurship cells, and early-stage mentoring programs as a structured screening and teaching aid."),
        ("Academic impact", "Provides an interdisciplinary experimental platform spanning software engineering, data science, ML, human–computer interaction, and entrepreneurship education."),
        ("Potential users", "Final-year engineering/MBA/MCA students, campus incubators, aspiring founders, entrepreneurship faculty, and early-stage mentoring programs."),
    ]
    for title, text in impacts:
        add_para(doc, f"• {title}: {text}", space_after=3)

    add_para(doc, "16. RELEVANCE:", size=11, bold=True)
    add_para(doc, "Tick wherever applicable", size=10, italic=True)
    relevance = [
        ("✓", "SDGs (Sustainable Development Goals) — Quality Education; Decent Work and Economic Growth; Industry, Innovation and Infrastructure"),
        ("✓", "Karnataka Priority Sector"),
        ("□", "Rural Development"),
        ("✓", "MSME"),
        ("□", "Agriculture"),
        ("□", "Healthcare"),
        ("□", "Water"),
        ("□", "Environment"),
        ("□", "Climate"),
        ("□", "Manufacturing"),
        ("□", "Smart Cities"),
        ("✓", "Digital India"),
        ("✓", "Startup"),
        ("□", "Women Empowerment"),
        ("□", "Others (Please Specify):"),
    ]
    for mark, label in relevance:
        add_para(doc, f"{mark}  {label}", space_after=1)

    add_para(doc, "17. WORK PLAN", size=11, bold=True, space_before=8)
    add_table(
        doc,
        ["Activity", "Month 1", "Month 2", "Month 3", "Month 4", "Month 5"],
        [
            ["Literature survey", "✓", "", "", "", ""],
            ["Design", "✓", "✓", "", "", ""],
            ["Development", "", "✓", "✓", "✓", ""],
            ["Testing", "", "", "✓", "✓", ""],
            ["Validation", "", "", "", "✓", "✓"],
            ["Final report", "", "", "", "", "✓"],
        ],
    )

    add_para(doc, "18. FACILITIES AVAILABLE:", size=11, bold=True)
    facilities = [
        ("1. Laboratory", blank("Computer / Software / AI-ML laboratory (TO BE CONFIRMED BY INSTITUTION)")),
        ("2. Equipment", "Desktop/laptop systems with internet connectivity; no specialized sensors required."),
        ("3. Software", "Node.js, Python 3, Visual Studio Code / Cursor, Git, browser tooling; optional Gemini API access."),
        ("4. Instruments", "NONE (software project)."),
        ("5. Workshop", "NONE (software project)."),
        ("6. Institutional facilities", blank("Departmental laboratory access / incubator cell (TO BE CONFIRMED)")),
    ]
    for title, text in facilities:
        add_rich(doc, [(f"{title}: ", True, False, 11), (text, False, False, 11)], space_after=3)

    add_para(doc, "19. MAJOR REQUIREMENTS FOR THE PROJECT:", size=11, bold=True)
    add_para(doc, "Hardware", size=11, bold=True, space_after=2)
    for item in [
        "Development laptops/PCs with at least 8 GB RAM and internet access.",
        "Optional: institutional server or always-on lab machine for shared demo hosting.",
    ]:
        add_para(doc, f"• {item}", space_after=2)
    add_para(doc, "Software", size=11, bold=True, space_after=2)
    for item in [
        "Node.js runtime and npm packages for the web server.",
        "Python 3 with ML dependencies required by local engines (XGBoost/pickle model support as applicable).",
        "Optional Google Gemini API key for generative coaching enrichment.",
        "Git for version control; modern web browser for UI testing.",
    ]:
        add_para(doc, f"• {item}", space_after=2)
    add_para(doc, "Consumables and services", size=11, bold=True, space_after=2)
    for item in [
        "Cloud/API credits for optional generative-AI coaching (if used during evaluation).",
        "Printing/binding for final report and posters, if required by the institution.",
    ]:
        add_para(doc, f"• {item}", space_after=2)

    add_para(doc, "20. BUDGET ESTIMATE:", size=11, bold=True)
    add_table(
        doc,
        ["Item", "Estimated cost (₹)"],
        [
            ["Equipment / Components", "Rs. 0/-"],
            ["Consumables", "Rs. 1,000/-"],
            ["Fabrication", "Rs. 0/-"],
            ["Software / Cloud Services", "Rs. 4,500/-"],
            ["Field Survey / Data Collection", "Rs. 0/-"],
            ["Testing / Analysis", "Rs. 1,500/-"],
            ["Miscellaneous", "Rs. 1,000/-"],
            ["Total", "Rs. 8,000/-"],
        ],
    )
    add_para(
        doc,
        "Budget notes: Equipment is assumed available in institutional labs. Software/cloud covers optional generative-AI "
        "API usage and any paid developer tools during evaluation. Adjust line items to match the Google Form exactly "
        "before submission. KSCST assistance, if sanctioned, is modest (typically up to ₹10,000).",
        size=9,
        italic=True,
    )

    add_para(doc, "21. REFERENCES:", size=11, bold=True)
    refs = [
        '[1] E. Ries, The Lean Startup. New York, NY, USA: Crown Business, 2011.',
        '[2] S. Blank and B. Dorf, The Startup Owner’s Manual. Pescadero, CA, USA: K&S Ranch, 2012.',
        '[3] T. Chen and C. Guestrin, “XGBoost: A Scalable Tree Boosting System,” in Proc. 22nd ACM SIGKDD Int. Conf. Knowledge Discovery and Data Mining (KDD), 2016, pp. 785–794.',
        '[4] C. Kerr, C. Farrukh, R. Phaal, and D. Probert, “Key principles for developing industrially relevant strategic technology management toolkits,” Technological Forecasting and Social Change, vol. 80, no. 6, pp. 1050–1070, 2013.',
        '[5] A. Ghezzi and A. Cavallo, “Agile Business Model Innovation in Digital Entrepreneurship: Lean Startup Approaches,” Journal of Business Research, vol. 110, pp. 519–537, 2020.',
        '[6] Google, “Gemini API documentation,” 2025. [Online]. Available: https://ai.google.dev/',
        '[7] Wikimedia Foundation, “Wikipedia and Wikidata APIs,” 2025. [Online]. Available: https://www.mediawiki.org/wiki/API and https://www.wikidata.org/',
        '[8] Product Hunt, “Product discovery and launch data,” 2025. [Online]. Available: https://www.producthunt.com/',
        '[9] P. Brusilovsky and E. Millán, “User Models for Adaptive Hypermedia and Adaptive Educational Systems,” in The Adaptive Web, P. Brusilovsky, A. Kobsa, and W. Nejdl, Eds. Berlin, Germany: Springer, 2007, pp. 3–53.',
        '[10] Karnataka State Council for Science and Technology (KSCST), “50th Series Student Project Programme (SPP): 2026–2027 Guidelines and Broad Themes,” Bengaluru, India, 2026.',
    ]
    for r in refs:
        add_para(doc, r, space_after=3)

    add_para(doc, "22. PROCESSING FEE PAYMENT DETAILS:", size=11, bold=True)
    add_para(doc, "Payment details:", size=11, bold=True, space_after=2)
    for line in [
        f"1. Mode of payment: {blank('☐ UPI   ☐ NEFT')}",
        f"2. Transaction / UTR / reference number: {blank()}",
        f"3. Date of payment: ____ / ____ / ______",
        "4. Amount paid: ₹1,180/-",
        f"5. Name of account holder: {blank()}",
        f"6. Name of bank (for NEFT): {blank()}",
        f"7. UPI id used: {blank()}",
    ]:
        add_para(doc, line, space_after=2)
    add_para(doc, "ATTACHMENT: ☐ Copy of UPI/NEFT payment receipt enclosed.", space_after=8)

    add_para(doc, "23. STUDENT DETAILS WITH SIGNATURE:", size=11, bold=True)
    add_table(
        doc,
        ["Sl. No.", "Name of Student (BLOCK LETTERS)", "USN / Registration No.", "Signature", "Date"],
        [
            ["1.", blank(), blank(), "", ""],
            ["2.", blank(), blank(), "", ""],
            ["3.", blank(), blank(), "", ""],
            ["4.", blank(), blank(), "", ""],
        ],
    )
    add_para(
        doc,
        "Name & Signature of SPP Coordinator with Seal: ______________________     "
        "Name & Signature of Project Guide with Seal: ______________________",
        space_after=2,
    )
    add_para(
        doc,
        f"Email id: {blank()}     Contact No.: {blank()}          "
        f"Email id: {blank()}     Contact No.: {blank()}",
        space_after=8,
    )

    add_para(doc, "Mandatory Attachments", size=11, bold=True)
    for item in [
        "☐ Project Proposal (PDF) duly signed by the Project Guide, Head of the Department and Principal/Head of the Institution.",
        "☐ Declaration and Endorsement by the Head of the Institution.",
        "☐ Copy of the Processing Fee Payment Receipt (UPI/NEFT).",
        "☐ Any other supporting documents, if applicable.",
    ]:
        add_para(doc, item, space_after=2)

    # Declaration
    add_heading_line(doc, "DECLARATION")
    add_para(doc, "(From the Project Team)", size=10, italic=True, center=True)
    add_para(doc, "Project Details", size=11, bold=True)
    add_para(
        doc,
        "Title of the Project: DESIGN AND DEVELOPMENT OF STARTUP SANDBOX: AN AI-POWERED PLATFORM FOR STARTUP "
        "VALIDATION, FOUNDER DECISION SIMULATION, AND ADAPTIVE ENTREPRENEURSHIP LEARNING.",
    )
    add_para(
        doc,
        "Broad Theme: Artificial Intelligence, Data Science and Digital Technologies (Theme 04).",
    )
    add_para(
        doc,
        "Sub-theme / Focus Area: AI/ML decision-support systems, digital twins/simulation, and AI for entrepreneurship education.",
    )
    add_para(doc, f"Department: {blank()}", space_after=2)
    add_para(doc, f"Institution: {blank()}", space_after=6)
    add_para(
        doc,
        "We, the undersigned members of the above project team, hereby declare that the information furnished in this "
        "project proposal is true, complete, and correct to the best of our knowledge and belief. We further agree to "
        "abide by all guidelines, terms, and conditions of the 50th Series Student Project Programme (SPP): 2026–2027, "
        "including originality, academic integrity, processing-fee rules, mid-term evaluation, report submission, and "
        "exhibition participation requirements as published by KSCST.",
    )
    add_para(
        doc,
        "Note: The use of AI tools, including ChatGPT and similar AI-based tools, shall not be used to generate or "
        "substitute the core project work, technical content, experimental results, data, analysis, or conclusions. "
        "Any limited language/formatting assistance shall be verified by the students and project guide.",
        size=9,
        italic=True,
    )
    add_table(
        doc,
        ["Sl. No.", "Name of Student", "USN / Registration No.", "Signature", "Date"],
        [
            ["1.", blank(), blank(), "", ""],
            ["2.", blank(), blank(), "", ""],
            ["3.", blank(), blank(), "", ""],
            ["4.", blank(), blank(), "", ""],
        ],
    )

    add_heading_line(doc, "DETAILS OF PROCESSING FEES MADE THROUGH NEFT / UPI PAYMENT")
    for line in [
        "1. TITLE OF THE PROJECT: DESIGN AND DEVELOPMENT OF STARTUP SANDBOX: AN AI-POWERED PLATFORM FOR STARTUP VALIDATION, FOUNDER DECISION SIMULATION, AND ADAPTIVE ENTREPRENEURSHIP LEARNING",
        f"2. NAME OF THE TEAM LEADER: {blank()}",
        f"3. EMAIL ID: {blank()}",
        f"4. CONTACT MOBILE NO.: {blank()}",
        f"5. BANK REF. NO. / UTR NO. / UPI No.: {blank()}",
        f"6. TRANSACTION ID: {blank()}",
        f"7. NAME OF THE SENDER / ACCOUNT HOLDER and CONTACT NUMBER: {blank()}",
        f"8. NAME OF THE BANK: {blank()}",
        "9. PROCESSING FEES: Rs. 1,180/- (Inclusive of 18% GST)",
        "10. DATE OF PAYMENT MADE: ____ / ____ / ______",
        f"11. TIME: {blank()}",
        "12. MODE OF PAYMENT MADE (NEFT / UPI): ☐ UPI   ☐ NEFT",
    ]:
        add_para(doc, line, space_after=2)

    add_para(
        doc,
        "(Name & Signature of the team leader) __________________     "
        "(Name & Signature of Project Guide / SPP Co-ordinator / HOD with Seal) __________________",
        space_after=12,
    )

    add_para(
        doc,
        "— End of filled technical proposal. Complete all [TO BE FILLED BY APPLICANT] fields, obtain signatures/seals, "
        "attach payment receipt, remove instructional notes if any remain, and export to PDF before Google Form submission. —",
        size=9,
        italic=True,
        center=True,
    )

    doc.save(OUT_DOCX)
    print(f"Wrote {OUT_DOCX}")


if __name__ == "__main__":
    build()
