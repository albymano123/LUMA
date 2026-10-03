# -*- coding: utf-8 -*-
"""Simple, column-width box-and-arrow diagrams for the new paper's figures."""

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib.colors import black, white

BOX_W = 210
MIN_BOX_H = 22
LINE_H = 9.4
PAD_V = 7
GAP = 16
FONT = "Times-Roman"
FONT_SIZE = 7.6
CHARS_PER_PT = 0.175  # rough average character width at FONT_SIZE, for wrapping


def _wrap(text, width):
    max_chars = max(10, int(width * CHARS_PER_PT))
    words = text.split()
    lines, current = [], ""

    for word in words:
        trial = f"{current} {word}".strip()

        if len(trial) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = trial

    if current:
        lines.append(current)

    return lines


def _box_lines_and_height(label, width):
    lines = _wrap(label, width)
    height = max(MIN_BOX_H, len(lines) * LINE_H + PAD_V)
    return lines, height


def _draw_box(d, cx, cy, lines, width, height, fill=white):
    d.add(Rect(cx - width / 2, cy - height / 2, width, height,
                strokeColor=black, strokeWidth=0.8, fillColor=fill))

    top = cy + (len(lines) - 1) * LINE_H / 2

    for i, line in enumerate(lines):
        d.add(String(cx, top - i * LINE_H - FONT_SIZE / 2.8, line,
                      fontName=FONT, fontSize=FONT_SIZE, textAnchor="middle"))


def _arrow(d, x, y_from, y_to):
    d.add(Line(x, y_from, x, y_to, strokeColor=black, strokeWidth=0.8))
    size = 3.5
    d.add(Polygon([x - size, y_to + size * 1.6, x + size, y_to + size * 1.6, x, y_to],
                   strokeColor=black, fillColor=black))


def pipeline_diagram(stages, width=240):
    """A vertical stack of labelled boxes joined by arrows, box height
    grown to fit each label's wrapped text so nothing overflows."""

    cx = width / 2
    prepared = [_box_lines_and_height(s, BOX_W) for s in stages]
    total_h = sum(h for _, h in prepared) + GAP * (len(stages) - 1) + 14
    d = Drawing(width, total_h)

    y = total_h - 7 - prepared[0][1] / 2

    for i, (lines, h) in enumerate(prepared):
        _draw_box(d, cx, y, lines, BOX_W, h)

        if i < len(prepared) - 1:
            next_h = prepared[i + 1][1]
            next_y = y - h / 2 - GAP - next_h / 2
            _arrow(d, cx, y - h / 2, next_y + next_h / 2)
            y = next_y

    return d


def branching_diagram(top, branches, bottom, width=240):
    """One box, two side-by-side boxes below it, then one box below those.
    Every box's height is grown to fit its own wrapped text."""

    cx = width / 2
    branch_w = BOX_W * 0.6
    left_x, right_x = cx - branch_w / 2 - 12, cx + branch_w / 2 + 12

    top_lines, top_h = _box_lines_and_height(top, BOX_W)
    b0_lines, b0_h = _box_lines_and_height(branches[0], branch_w)
    b1_lines, b1_h = _box_lines_and_height(branches[1], branch_w)
    mid_h = max(b0_h, b1_h)
    bottom_lines, bottom_h = _box_lines_and_height(bottom, BOX_W)

    total_h = top_h + GAP + mid_h + GAP + bottom_h + 14
    d = Drawing(width, total_h)

    top_y = total_h - 7 - top_h / 2
    _draw_box(d, cx, top_y, top_lines, BOX_W, top_h)

    mid_y = top_y - top_h / 2 - GAP - mid_h / 2
    _draw_box(d, left_x, mid_y, b0_lines, branch_w, b0_h)
    _draw_box(d, right_x, mid_y, b1_lines, branch_w, b1_h)

    junction_y = top_y - top_h / 2 - GAP / 2
    d.add(Line(cx, top_y - top_h / 2, cx, junction_y, strokeColor=black, strokeWidth=0.8))
    d.add(Line(left_x, junction_y, right_x, junction_y, strokeColor=black, strokeWidth=0.8))
    _arrow(d, left_x, junction_y, mid_y + mid_h / 2)
    _arrow(d, right_x, junction_y, mid_y + mid_h / 2)

    bottom_y = mid_y - mid_h / 2 - GAP - bottom_h / 2
    merge_y = mid_y - mid_h / 2 - GAP / 2
    d.add(Line(left_x, mid_y - mid_h / 2, left_x, merge_y, strokeColor=black, strokeWidth=0.8))
    d.add(Line(right_x, mid_y - mid_h / 2, right_x, merge_y, strokeColor=black, strokeWidth=0.8))
    d.add(Line(left_x, merge_y, right_x, merge_y, strokeColor=black, strokeWidth=0.8))
    _arrow(d, cx, merge_y, bottom_y + bottom_h / 2)
    _draw_box(d, cx, bottom_y, bottom_lines, BOX_W, bottom_h)

    return d
