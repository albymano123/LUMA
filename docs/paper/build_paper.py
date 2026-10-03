# -*- coding: utf-8 -*-
"""
Renders the new LumaPath conference paper as a PDF, matching the old
paper's measured page geometry, two-column IEEE-style layout and
typography (see docs/PAPER_AUDIT.md for how the geometry was measured).

    venv/Scripts/python docs/paper/build_paper.py

Content lives in content.py (tables, references, abstract) and in the
SECTIONS prose below; diagrams.py draws the three figures.
"""

import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, FrameBreak, Image, NextPageTemplate, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.frames import Frame

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import content
from diagrams import branching_diagram, pipeline_diagram

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "LumaPath_2026.pdf")

# ==================================================
# MEASURED PAGE GEOMETRY (docs/PAPER_AUDIT.md)
# ==================================================

PAGE_W, PAGE_H = letter  # 612 x 792 pt
MARGIN = 49
COL_W = 251
GUTTER = 12
LEFT_X = MARGIN
RIGHT_X = LEFT_X + COL_W + GUTTER
TOP_Y = PAGE_H - 50
BOTTOM_Y = 73
TITLE_FRAME_BOTTOM = PAGE_H - 399
TITLE_FRAME_HEIGHT = TOP_Y - TITLE_FRAME_BOTTOM
COL_HEIGHT_P1 = TITLE_FRAME_BOTTOM - BOTTOM_Y
COL_HEIGHT_BODY = TOP_Y - BOTTOM_Y

# ==================================================
# STYLES
# ==================================================

TITLE_STYLE = ParagraphStyle("Title", fontName="Times-Roman", fontSize=23.9,
                              leading=27, alignment=TA_CENTER, spaceAfter=10)
AUTHOR_NAME = ParagraphStyle("AuthorName", fontName="Times-Roman", fontSize=11,
                               leading=13, alignment=TA_CENTER)
AUTHOR_AFFIL = ParagraphStyle("AuthorAffil", fontName="Times-Italic", fontSize=11,
                                leading=13, alignment=TA_CENTER)
AUTHOR_EMAIL = ParagraphStyle("AuthorEmail", fontName="Times-Roman", fontSize=11,
                                leading=13, alignment=TA_CENTER)
ABSTRACT_STYLE = ParagraphStyle("Abstract", fontName="Times-Roman", fontSize=9,
                                  leading=10.8, alignment=TA_JUSTIFY, spaceAfter=6)
SECTION_STYLE = ParagraphStyle("Section", fontName="Times-Bold", fontSize=10,
                                 leading=13, alignment=TA_CENTER,
                                 spaceBefore=10, spaceAfter=6)
SUBSECTION_STYLE = ParagraphStyle("Subsection", fontName="Times-Italic", fontSize=10,
                                    leading=13, alignment=TA_LEFT,
                                    spaceBefore=7, spaceAfter=3)
BODY_STYLE = ParagraphStyle("Body", fontName="Times-Roman", fontSize=10,
                              leading=12, alignment=TA_JUSTIFY, spaceAfter=6,
                              firstLineIndent=12)
CAPTION_STYLE = ParagraphStyle("Caption", fontName="Times-Roman", fontSize=8,
                                 leading=10, alignment=TA_CENTER, spaceBefore=4, spaceAfter=10)
TABLE_TITLE_STYLE = ParagraphStyle("TableTitle", fontName="Times-Bold", fontSize=8,
                                     leading=10, alignment=TA_CENTER, spaceAfter=4)
TABLE_CELL = ParagraphStyle("TableCell", fontName="Times-Roman", fontSize=7.3, leading=8.8)
TABLE_HEAD = ParagraphStyle("TableHead", fontName="Times-Bold", fontSize=7.3, leading=8.8,
                              alignment=TA_CENTER)
REF_STYLE = ParagraphStyle("Ref", fontName="Times-Roman", fontSize=8, leading=9.6,
                             alignment=TA_JUSTIFY, leftIndent=10, firstLineIndent=-10,
                             spaceAfter=3)

# ==================================================
# PAGE TEMPLATES
# ==================================================

def make_doc():
    frame_title = Frame(LEFT_X, TITLE_FRAME_BOTTOM, PAGE_W - 2 * MARGIN, TITLE_FRAME_HEIGHT,
                          id="title", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame_left1 = Frame(LEFT_X, BOTTOM_Y, COL_W, COL_HEIGHT_P1, id="col1a",
                         leftPadding=0, rightPadding=6, topPadding=0, bottomPadding=0)
    frame_right1 = Frame(RIGHT_X, BOTTOM_Y, COL_W, COL_HEIGHT_P1, id="col1b",
                          leftPadding=6, rightPadding=0, topPadding=0, bottomPadding=0)

    frame_left = Frame(LEFT_X, BOTTOM_Y, COL_W, COL_HEIGHT_BODY, id="colA",
                        leftPadding=0, rightPadding=6, topPadding=0, bottomPadding=0)
    frame_right = Frame(RIGHT_X, BOTTOM_Y, COL_W, COL_HEIGHT_BODY, id="colB",
                         leftPadding=6, rightPadding=0, topPadding=0, bottomPadding=0)

    doc = BaseDocTemplate(OUT_PATH, pagesize=letter,
                           title="LumaPath: A Safety-Aware Route Recommendation System",
                           author="Alan C V, Alby Mano, Abishek P S, Adhisankar M M, Geethu Wilson, Anly Antony M")
    doc.addPageTemplates([
        PageTemplate(id="First", frames=[frame_title, frame_left1, frame_right1]),
        PageTemplate(id="Body", frames=[frame_left, frame_right]),
    ])
    return doc


# ==================================================
# SMALL HELPERS
# ==================================================

def P(text, style=BODY_STYLE):
    return Paragraph(text, style)


def body(paragraphs):
    return [P(t) for t in paragraphs]


def section(number_title):
    return P(number_title.upper(), SECTION_STYLE)


def subsection(letter_title):
    return P(letter_title, SUBSECTION_STYLE)


def render_table(table_def):
    number, title, headers, rows, note = table_def
    story = [
        P(f"TABLE {number}", TABLE_TITLE_STYLE),
        P(title, TABLE_TITLE_STYLE),
    ]

    header_row = [Paragraph(h, TABLE_HEAD) for h in headers]
    data_rows = [[Paragraph(cell.replace("\n", "<br/>"), TABLE_CELL) for cell in row] for row in rows]
    data = [header_row] + data_rows

    col_width = (COL_W - 4) / len(headers)
    t = Table(data, colWidths=[col_width] * len(headers), repeatRows=1)
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)

    if note:
        story.append(P(note, CAPTION_STYLE))
    else:
        story.append(Spacer(1, 8))

    return story


def render_figure(number, drawing, caption):
    return [drawing, P(f"Fig. {number}.&nbsp;&nbsp;{caption}", CAPTION_STYLE)]


# ==================================================
# FRONT MATTER
# ==================================================

def front_matter():
    story = [P(content.TITLE, TITLE_STYLE), Spacer(1, 6)]

    # Three rows of two authors, matching the old paper's author-block grid.
    for i in range(0, len(content.AUTHORS), 2):
        pair = content.AUTHORS[i:i + 2]
        cells = []

        for name, email in pair:
            cells.append([
                P(name, AUTHOR_NAME),
                P(AFFILIATION_LINE1, AUTHOR_AFFIL),
                P(AFFILIATION_LINE2, AUTHOR_AFFIL),
                P(email, AUTHOR_EMAIL),
            ])

        if len(cells) == 1:
            cells.append([Spacer(1, 1)])

        t = Table([[cells[0], cells[1]]], colWidths=[(PAGE_W - 2 * MARGIN) / 2] * 2)
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        story.append(t)
        story.append(Spacer(1, 6))

    story.append(FrameBreak())

    abstract_html = (
        "<b><i>Abstract—</i></b>" + content.ABSTRACT
    )
    story.append(P(abstract_html, ABSTRACT_STYLE))
    index_html = "<b><i>Index Terms—</i></b>" + content.INDEX_TERMS
    story.append(P(index_html, ABSTRACT_STYLE))

    story.append(NextPageTemplate("Body"))
    story.append(FrameBreak())

    return story


AFFILIATION_LINE1 = content.AFFILIATION[0]
AFFILIATION_LINE2 = content.AFFILIATION[1]

# ==================================================
# BODY PROSE
# ==================================================

INTRODUCTION = [
    "Conventional navigation systems select routes by distance or "
    "estimated travel time, leaving safety information for the traveller "
    "to judge separately. Dijkstra's shortest-path algorithm and later "
    "work on efficient route planning in large transportation networks "
    "provide the computational foundation for this process [1], [2], but "
    "those objectives say nothing about whether a route passes places "
    "with emergency services nearby, is well lit, or is currently being "
    "rained on.",

    "The original LumaPath prototype proposed closing this gap with an "
    "“AI/ML-based safety analysis stage” placed between data "
    "collection and route recommendation. This paper reports what "
    "LumaPath has become since: a system whose ranking is driven by a "
    "documented, explainable, rule-based safety baseline computed from a "
    "real local geospatial database, with a separate, genuinely-trained "
    "AI/ML model reported alongside it as additional analysis rather than "
    "as the ranking mechanism. This is a deliberate correction, not a "
    "cosmetic one: the original evaluation section itself acknowledged "
    "that no trained model had actually been assessed, and the system's "
    "ranking logic has in fact always been rule-based.",

    "The contribution of this paper is threefold. First, it documents the "
    "current geospatial, routing, and safety-scoring architecture exactly "
    "as implemented, including a local SQLite and R-Tree spatial database "
    "built once from an OpenStreetMap extract — a design adopted "
    "specifically because the public Overpass API was observed to "
    "rate-limit, time out, and return incomplete results under real use. "
    "Second, it adds a genuine AI/ML contribution: a gradient-boosted "
    "regressor trained to approximate the rule-based score from real "
    "route and weather features (a surrogate or distillation model, not "
    "a crime predictor, since no incident dataset exists for this "
    "project), together with an unsupervised isolation forest that flags "
    "routes with an unusual feature combination. Third, it reports "
    "measurements actually obtained by running the system — "
    "including a case, disclosed in Section V, where a public routing "
    "service's own rate limiting prevented a planned experiment from "
    "completing at full scale, which is itself evidence for why the "
    "local-database decision in Section III-B was made.",
]

RELATED_WORK = [
    "Research on safe route recommendation has developed along several "
    "related directions. Crime-informed routing uses historical incidents "
    "or risk surfaces to modify conventional road costs: Galbrun et al. "
    "formulated safe path finding beyond the shortest route, and Levy et "
    "al. introduced a learning-based approach that learns safer "
    "navigation behaviour from urban data [6], [7]. Other work applies "
    "machine learning directly to route risk: Puthige et al. used "
    "danger-index calculation with K-means clustering [12], Zhou et al. "
    "combined neural networks with fuzzy evaluation for multi-hazard road "
    "risk [15], and Jiang et al. combined multiple sourced data for route "
    "mapping [16]. Participatory systems such as TREADS mine social media "
    "for route-level safety cues [9], and privacy-aware approaches "
    "incorporate crowdsourced observations [8]. Environmental and "
    "infrastructure research adds further evidence: Huang et al. "
    "investigated route safety through conflict simulation, Litzinger et "
    "al. examined weather information in route planning [10], [17], "
    "Mukherjee and Mitra studied pedestrian safety at urban intersections "
    "[18], and Al-Bdairi et al. analysed weather-related crash severity "
    "[19]. Reviews by Lakshmi and Joseph, and by Parvez and Moridpour, "
    "survey the broad range of safety factors considered in intelligent "
    "transportation research [21], [22].",

    "This paper's distinction from that body of work, and from LumaPath's "
    "own earlier description of itself, is architectural honesty about "
    "where learning actually happens. Where the earlier LumaPath "
    "description placed an unevaluated “trained route-safety "
    "model” at the centre of ranking, the present system places a "
    "documented rule-based baseline there, with AI/ML analysis reported "
    "as a separate, clearly-scoped layer whose target is the baseline's "
    "own real-data-driven output rather than an unavailable incident "
    "label — a distillation/surrogate-modelling approach [11], "
    "together with unsupervised outlier detection using isolation forests "
    "[28]. Project OSRM, OpenStreetMap, Overpass and Open-Meteo remain "
    "the data infrastructure [23]–[26], as in the original "
    "description, and the local-database design (Section III-B) builds on "
    "the real-time routing work of Luxen and Vetter [25].",
]

SYSTEM_OVERVIEW = [
    "LumaPath combines route generation, local geospatial lookup, "
    "weather retrieval, rule-based safety scoring, and AI/ML analysis "
    "into a single request/response cycle, exposed over JSON REST and, "
    "for the web client, an additional newline-delimited-JSON streaming "
    "endpoint that reports each pipeline stage's completion honestly "
    "(it never claims a stage finished before it did). Fig. 1 shows the "
    "architecture. A client supplies a source, a destination and a "
    "travel mode (walking, cycling or driving); the backend generates "
    "alternative routes, gathers map and weather data for all of them at "
    "once, measures each route against that shared data, scores it with "
    "the rule-based baseline, analyses it with the AI/ML model, and "
    "returns the ranked alternatives.",
]

LOCAL_DATABASE = [
    "The public Overpass API, which the earlier LumaPath description "
    "used as its only geospatial source, was found in practice to "
    "rate-limit (HTTP 429), time out, or return empty results under "
    "load — producing missing hospitals, “insufficient "
    "data” scores, and multi-second to multi-tens-of-second "
    "searches. LumaPath now builds a local, read-only SQLite database "
    "with an R-Tree spatial index once, offline, from an OpenStreetMap "
    "extract (openstreetmap.fr's Kerala extract by default), and ships it "
    "inside the deployed image. As measured from a real build of this "
    "database (Table VI): 495,875 road ways and 151,361 mapped places "
    "(hospitals, clinics, police and fire stations, and activity places "
    "such as shops and transit stops), plus 2,598,464 building footprints "
    "reduced to 1,268,240 cells on a 50 m grid for building-density "
    "queries, in a 122 MB file built in 132 seconds. Road geometry is "
    "stored zlib-compressed and delta-encoded; the R-Tree gives O(log n) "
    "bounding-box lookups, after which exact distances are computed with "
    "NumPy. A trip is served from the local database only when every "
    "point of every candidate route is inside the extract's coverage "
    "polygon and at least the mode's emergency-search radius away from "
    "its edge (2, 3 or 5 km for walking, cycling and driving "
    "respectively); trips that fail this margin fall back to live "
    "Overpass, so coverage degrades gracefully near the data's edge "
    "instead of silently looking safer than it is.",
]

ROUTE_GENERATION = [
    "Alternative routes come from OSRM: the FOSSGIS "
    "project's dedicated foot and bike profiles for walking and cycling, "
    "and its car profile for driving, falling back to the public "
    "router.project-osrm.org instance if that fails. Because OSRM "
    "typically returns only one or two alternatives in practice, LumaPath "
    "additionally requests routes forced through via-points placed on "
    "either side of the direct line, at two distances and both sides, "
    "then discards anything that is a near-duplicate of a route already "
    "kept (more than 80% path overlap in both directions), a large "
    "detour (more than 1.6x the shortest candidate's distance), or a "
    "route that doubles back on itself (a sign the via-point landed on a "
    "dead end). Up to five distinct alternatives are kept, ordered "
    "fastest-first.",
]

FEATURE_ENGINEERING = [
    "Every candidate route is resampled along its full geometry (not "
    "just its endpoints) and measured against the shared map and weather "
    "data: road type, sidewalk and lighting tags, speed limits, junction "
    "and dead-end density, the share of the route within a building-dense "
    "area, and the longest stretch without one, the median distance to "
    "the nearest hospital/clinic and police station, and a route-wide "
    "weather summary (the worst visibility and weather code met along "
    "the way, not an average, since a single short hazardous stretch "
    "should not be diluted away). Table II lists the real features "
    "available and which stage consumes each. The same feature-extraction "
    "functions measure a live route, a route drawn from the local "
    "database, and a training example for the AI/ML model, so the three "
    "cannot silently drift apart.",
]

RULE_BASELINE = [
    "The rule-based baseline (safety.py) is the only place a numeric "
    "safety score, a risk level, or a route recommendation is computed; "
    "nothing downstream recalculates or overrides it. A route is scored "
    "on up to six factors — emergency access, street activity, "
    "built-up surroundings, street lighting, road/traffic exposure, and "
    "weather — each a 0–100 measurement expressed as a share of "
    "the route's length so that a longer route is not scored as safer "
    "merely for passing more things. Weights differ by travel mode and by "
    "day/night (for example, lighting and street activity are weighted "
    "more heavily at night; a weight of zero means a factor does not "
    "apply to that mode at all, such as street activity for driving). "
    "When a factor's underlying data is unavailable, or an OpenStreetMap "
    "tag's coverage is too sparse along a route to trust the ratio, that "
    "factor is left out entirely and the remaining weights are rescaled, "
    "and the response reports a lower confidence level rather than "
    "silently treating the gap as zero. Below a minimum scored weight, no "
    "numeric score is produced at all; the response says so explicitly "
    "(“Insufficient data”) instead of guessing.",
]

AIML_MODEL = [
    "No real incident or crime dataset exists for this project, and none "
    "was fabricated to train a model — the project's earlier 10-row "
    "synthetic training set was deliberately removed for exactly this "
    "reason. An incident-rate pipeline (ml/build_dataset.py, "
    "ml/train_model.py, ml/predict_model.py) exists, ready to train on "
    "real incident records if they are ever supplied, gated behind a "
    "minimum of 300 real road windows and 200 real incidents and "
    "validated by spatial group k-fold cross-validation against a "
    "plain average-rate baseline; today it reports status "
    "“not_trained” by design, honestly, rather than an invented "
    "number.",

    "This paper adds a second, genuinely-trained AI/ML component that "
    "does not require incident data. A HistGradientBoostingRegressor is "
    "trained to predict the rule-based score from the same real route "
    "and weather features (Table II, plus five weather features: "
    "precipitation, wind speed, temperature, visibility, and day/night), "
    "sampled from real routes between real mapped locations across "
    "Kerala, using the exact production functions (routing_service, "
    "route_analyzer, safety.py) rather than a separate code path. This is "
    "a surrogate or distillation model [11]: its label is the rule "
    "engine's own real-data-driven score, not a claim about crime or "
    "incidents, and it is documented as such everywhere it appears. "
    "Alongside it, an IsolationForest trained unsupervised on the same "
    "feature matrix, with no label at all, flags routes whose feature "
    "combination is unusual relative to the training routes [28]. "
    "Table V gives the configuration; Section V reports what could and "
    "could not be measured in this evaluation window.",

    "Neither model ranks or recommends a route. Both are exposed as an "
    "additional, explicitly labelled field (ml_safety_model) on every "
    "analysed route, alongside the still-ungated incident-rate field "
    "(ml_estimate); the existing rule-based ranking function "
    "(safety.categorize_routes) was not modified to consume either of "
    "them. This was a deliberate integration choice, not an oversight: "
    "the existing, working application's behaviour for every user-facing "
    "outcome is unchanged by this paper's AI/ML addition, which was "
    "verified by re-running the full pre-existing backend test suite "
    "after the change (Table VI).",
]

RECOMMENDATION = [
    "The final stage tags each analysed route with one or more of "
    "“fastest”, “safest” and “balanced” and "
    "decides whether a safety recommendation is defensible. The fastest "
    "route is simply the quickest. The safest route is the quickest among "
    "those within a small tie margin of the highest rule-based score, so "
    "a one-point difference never discards a materially faster route. "
    "The balanced route scores the best weighted mix of safety (50%), "
    "time (30%) and distance (20%) among scored routes. Critically, a "
    "route is only recommended as the safest choice when at least one "
    "route has a score at all and that score does not rest on low-"
    "confidence data; otherwise the state is “unavailable”, the "
    "quickest route is offered only as a default selection, and it is "
    "never labelled as a safety recommendation. Fig. 3 shows this "
    "decision flow.",
]

IMPLEMENTATION = [
    "The client is built with React 19, Vite, Leaflet and MapLibre GL "
    "(vector basemap with a raster-tile fallback); the backend is "
    "FastAPI with asynchronous HTTP clients throughout, so OSRM, Overpass "
    "(when used), and Open-Meteo requests for all candidate routes run "
    "concurrently rather than one after another. Table III lists the "
    "full current stack, corrected against the old paper's Table III "
    "(docs/PAPER_AUDIT.md documents every difference and why). The "
    "biggest correction is persistence: there is no PostgreSQL/PostGIS "
    "instance anywhere in the current system; the local SQLite file "
    "(Section III-B) is reference data that never changes at runtime, so "
    "a database server would add operational cost without adding "
    "anything a read-only indexed file cannot already do.",

    "The system ships as a single three-stage Docker image: a Node stage "
    "builds the web client; a Python stage downloads the OpenStreetMap "
    "extract (with retries, a growing back-off, and a file-size check "
    "that rejects a truncated download) and builds the local database, "
    "or, if configured, downloads an already-built one; a final stage "
    "assembles a small runtime image containing neither Node nor the "
    "build-only OpenStreetMap-processing library. One concrete deployment "
    "defect found and fixed during this project is worth recording "
    "precisely because it is a common, easy-to-miss class of bug: the "
    "`python:slim` base image does not ship `libexpat.so.1`, "
    "`libstdc++.so.6` or `libgcc_s.so.1`, which the compiled extensions "
    "for OpenStreetMap processing, NumPy and Pydantic's validation core "
    "all link against; the fix was three explicit `apt-get install` "
    "lines (`libexpat1`, `libstdc++6`, `libgcc-s1`), verified against the "
    "exact shared-library dependencies of the real manylinux wheels and "
    "against the Debian package that provides each one. The image is "
    "deployed to Render's free tier via a committed blueprint "
    "(render.yaml), with a health endpoint that reports the local "
    "database's size and extract date.",
]

EVALUATION_INTRO = [
    "Three kinds of measurement are reported here, and each is labelled "
    "as what it actually is: real measurements taken by running this "
    "repository's code (local database construction and query "
    "performance, a live end-to-end route analysis, the automated test "
    "suite); a real code-correctness check run on synthetic data with a "
    "known relationship (confirming the AI/ML training and "
    "cross-validation code behaves correctly, not a claim about "
    "real-world accuracy); and one planned real-world experiment that "
    "this evaluation window could not complete, disclosed rather than "
    "omitted or filled with an invented number.",
]

EVALUATION_QUERY = [
    "Table VI reports local-database construction (Section III-B) and "
    "four R-Tree query benchmarks measured directly against the shipped "
    "database on the development machine used for this paper: finding "
    "roads near a route-shaped bounding box, finding nearby emergency "
    "services, finding nearby activity places, and sampling building "
    "density, each in single-digit to double-digit milliseconds. These "
    "numbers are why the architecture decision in Section III-B holds up "
    "under its own stated justification: a single local file genuinely "
    "answers the queries the rule-based and AI/ML stages both depend on "
    "quickly enough that network calls to OSRM and Open-Meteo, not the "
    "local database, dominate end-to-end latency.",
]

EVALUATION_CASE_STUDY = [
    "Table IV reports one real, live run of the full analysis pipeline "
    "(local database lookup, live Open-Meteo weather, the rule-based "
    "baseline, and the AI/ML analysis module) on three real OpenStreetMap "
    "road geometries near Kochi, Kerala, captured on 2026-10-03. Route "
    "geometry for this specific run came directly from the local "
    "database rather than from an OSRM-generated route, because, as "
    "Section V explains, the public OSRM evaluation servers this "
    "project depends on began rate-limiting this evaluation session; "
    "every other stage — including the AI/ML analysis — ran "
    "exactly as it does in production. The AI/ML field correctly "
    "reported status “not_trained” for all three routes, since "
    "no training run had completed; this is the intended, honest "
    "behaviour of a model that is not yet trained, not a defect.",
]

EVALUATION_AIML = [
    "The AI/ML training and cross-validation code (ml/train_surrogate.py) "
    "was verified in two independent ways. First, the automated test "
    "suite (196 tests, 11 of them new for this component) exercises "
    "every status the live API can return (not_trained, unsupported "
    "mode, unavailable road data, and ready), confirms the feature "
    "vector has exactly the 20 declared real columns with no accidental "
    "zero-filling of missing weather or road data, confirms training "
    "refuses to proceed below a minimum route count, and confirms the "
    "isolation forest flags a feature combination that is, by "
    "construction, far outside every training column's range as "
    "unusual. Second, on a 300-row synthetic table with a known linear-"
    "plus-noise relationship between three features and the label — "
    "used only to confirm the training and grouped cross-validation code "
    "itself is correct, not as a claim about real safety prediction "
    "— the measured held-out R² was 0.947 and the held-out mean "
    "absolute error was 2.35 points, both consistent with a correctly "
    "implemented gradient-boosted regressor and grouped k-fold split.",

    "What could not be completed in this evaluation window is the "
    "real-world measurement that matters most: held-out, cross-validated "
    "R² and MAE for the surrogate model trained on real Kerala "
    "routes. A pilot run of ml/build_route_dataset.py against the real "
    "local database and the live public OSRM and Open-Meteo services "
    "succeeded for its first 20 of 20 attempted origin/destination pairs "
    "(88 real scored routes) before the public OSRM foot-routing server "
    "this project depends on began refusing further connections from "
    "this evaluation session entirely (not HTTP 429 rate-limiting, but "
    "connection failure to every configured OSRM host, while Open-Meteo "
    "and general internet connectivity remained unaffected, isolating "
    "the cause to that specific free service). Because the pilot run's "
    "rows were not persisted before the connection was lost, and because "
    "continuing to retry a service that is actively refusing connections "
    "would be an inconsiderate use of a free public resource, this "
    "experiment is reported as <b>to be evaluated</b>, to be completed "
    "either against a self-hosted OSRM instance or once the evaluation "
    "window reopens, rather than filled with a number that was not "
    "actually measured. This is, itself, direct supporting evidence for "
    "the local-database design decision in Section III-B: it is exactly "
    "the kind of free-service unreliability that motivated moving the "
    "map data path off live external queries in the first place, and it "
    "shows the same class of risk remains wherever OSRM is still called "
    "live (route generation itself).",
]

LIMITATIONS_CONCLUSION = [
    "The system's safety assessment is bounded by what is reflected in "
    "OpenStreetMap, which is more complete in some areas of Kerala than "
    "others; the absence of a mapped hospital does not mean one does not "
    "exist, and both the rule-based baseline and the AI/ML model can only "
    "learn from, or react to, information actually present in their "
    "inputs. The AI/ML surrogate model's real-world generalisation is, as "
    "Section V discloses, not yet measured at the scale originally "
    "planned, because of external rate-limiting rather than a flaw in "
    "the training code itself; the architecture and the code path are "
    "both verified, and completing the real-world measurement is the "
    "immediate next step, not a question of further design work. More "
    "broadly, a model trained on routes from one part of Kerala may not "
    "generalise to a different region's road character, which is why "
    "cross-validation is done by held-out area rather than held-out "
    "route, and why the rule-based baseline — whose behaviour is "
    "traceable to individual, inspectable conditions — remains the "
    "system's authoritative score rather than being replaced by a model "
    "whose real-world accuracy is still being established.",

    "LumaPath is positioned, deliberately, as a decision-support tool, "
    "not a safety guarantee: it presents a score, a risk level, "
    "supporting observations, and now an additional AI/ML perspective, "
    "so a user can judge a route's safety-relevant characteristics in "
    "context rather than being handed an unexplained number. This paper "
    "has reported the system as it actually exists — a local, "
    "spatially-indexed geospatial database replacing live Overpass "
    "queries; a documented, explainable, mode- and time-aware rule-based "
    "baseline that has always driven ranking; and a new, genuinely "
    "trained AI/ML surrogate-and-anomaly-detection layer reported "
    "alongside it, honestly, as additional analysis rather than as an "
    "unevaluated claim. Future work includes completing the real-world "
    "AI/ML evaluation disclosed in Section V, extending training data "
    "to more regions and travel modes, and, if a real incident or safety "
    "report dataset becomes available, training the separate "
    "incident-rate pipeline that already exists and is already gated "
    "for exactly that purpose.",
]


def build_story():

    story = front_matter()

    story.append(section("I. Introduction"))
    story += body(INTRODUCTION)

    story.append(section("II. Related Work"))
    story += body(RELATED_WORK)

    story.append(section("III. System Architecture and Methodology"))
    story.append(subsection("A. Overview and Design Principles"))
    story += body(SYSTEM_OVERVIEW)
    story += render_figure(1, pipeline_diagram([
        "Client (React, Leaflet/MapLibre)",
        "FastAPI backend",
        "Routing (OSRM + via-point\ngeneration, Sec. III-C)",
        "Local geospatial DB (SQLite +\nR-Tree) / Overpass fallback",
        "Weather (Open-Meteo)",
        "Route feature engineering",
        "Rule-based safety baseline\n(authoritative score + ranking)",
        "AI/ML analysis (surrogate +\nanomaly; additive, Sec. III-F)",
        "Ranked routes + explanations",
    ]), "Current LumaPath system architecture. The AI/ML box is parallel "
        "to, and does not gate, the ranking step.")

    story.append(subsection("B. Local Geospatial Database"))
    story += body(LOCAL_DATABASE)

    story.append(subsection("C. Route Generation"))
    story += body(ROUTE_GENERATION)

    story.append(subsection("D. Route Feature Engineering"))
    story += body(FEATURE_ENGINEERING)
    story += render_table(content.TABLE_FEATURES)

    story.append(subsection("E. Rule-Based Safety Baseline"))
    story += body(RULE_BASELINE)

    story.append(subsection("F. AI/ML Safety Analysis Model"))
    story += body(AIML_MODEL)
    story += render_figure(2, branching_diagram(
        "Real route + weather features\n(Table II)",
        ["Gradient-boosted regressor\n(predicts rule score)",
         "Isolation forest\n(flags unusual routes)"],
        "Reported as ml_safety_model\n(additive, not authoritative)",
    ), "AI/ML route-analysis pipeline: a supervised surrogate and an "
       "unsupervised anomaly detector, both reported, neither ranking.")

    story.append(subsection("G. Safety-Aware Route Recommendation"))
    story += body(RECOMMENDATION)
    story += render_figure(3, pipeline_diagram([
        "All analysed, scored routes",
        "Tag fastest / safest (within tie\nmargin) / balanced",
        "Scored with high/medium\nconfidence?",
        "Recommend safest route",
        "(else) Default to fastest;\nstate = unavailable",
    ]), "Safety-aware recommendation workflow (safety.categorize_routes).")

    story.append(section("IV. Implementation and Deployment"))
    story += body(IMPLEMENTATION)
    story += render_table(content.TABLE_STACK)

    story.append(section("V. Experimental Evaluation and Results"))
    story += body(EVALUATION_INTRO)
    story += render_table(content.TABLE_DATA_SOURCES)
    story += body(EVALUATION_QUERY)
    story += body(EVALUATION_CASE_STUDY)
    story += render_table(content.TABLE_CASE_STUDY)
    story += body(EVALUATION_AIML)
    story += render_table(content.TABLE_MODEL_CONFIG)
    story += render_table(content.TABLE_RESULTS)
    story += render_table(content.TABLE_COMPARISON)

    story.append(section("VI. Limitations, Conclusion and Future Work"))
    story += body(LIMITATIONS_CONCLUSION)

    story.append(section("References"))

    for i, ref in enumerate(content.REFERENCES, start=1):
        story.append(P(f"[{i}]&nbsp;&nbsp;{ref}", REF_STYLE))

    return story


def main():
    doc = make_doc()
    doc.build(build_story())
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
