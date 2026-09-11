"""Render the completed capability results into a concise review PDF."""
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib.pagesizes import A4

folder = Path(sys.argv[1]).resolve()
stats = json.loads((folder / "statistics.json").read_text())
output = Path(sys.argv[2]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
navy = colors.HexColor("#142D36")
teal = colors.HexColor("#167A70")
muted = colors.HexColor("#53656C")
light = colors.HexColor("#EDF4F3")
amber = colors.HexColor("#9B6316")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleTom", fontName="Helvetica-Bold", fontSize=28, leading=31, textColor=navy, spaceAfter=14))
styles.add(ParagraphStyle(name="SubtitleTom", fontName="Helvetica", fontSize=12, leading=17, textColor=muted, spaceAfter=14))
styles.add(ParagraphStyle(name="HeadingTom", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=teal, spaceBefore=14, spaceAfter=8))
styles.add(ParagraphStyle(name="BodyTom", fontName="Helvetica", fontSize=10, leading=14.5, textColor=navy, spaceAfter=8))
styles.add(ParagraphStyle(name="SmallTom", fontName="Helvetica", fontSize=8.4, leading=12, textColor=muted, spaceAfter=6))
styles.add(ParagraphStyle(name="CellTom", fontName="Helvetica", fontSize=9, leading=12, textColor=navy))
story = []
def p(text, style="BodyTom"):
    return Paragraph(text, styles[style])
def add(text, style="BodyTom"):
    story.append(p(text, style))
def heading(text):
    add(text, "HeadingTom")
def table(rows, widths):
    data = [[p(escape(str(c)), "CellTom") for c in row] for row in rows]
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,0),light),
        ("VALIGN", (0,0),(-1,-1),"TOP"),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
        ("TOPPADDING",(0,0),(-1,-1),6), ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LINEBELOW",(0,0),(-1,0),1,teal),
        ("LINEBELOW",(0,1),(-1,-1),0.4,colors.HexColor("#DAE4E4")),
    ]))
    story.append(t)
names={"direct":"Direct contents", "minimal":"Minimal tool loop", "tom":"Tom 0.5.0", "aider":"Aider 0.86.2"}
def rate(a):
    s=stats["aggregate"][a]
    return f'{s["passed"]}/{s["n"]} ({100*s["passed"]/s["n"]:.1f}%)'

add("TOM / LOCAL CAPABILITY STUDY", "SmallTom")
add("What the harness<br/>actually delivers", "TitleTom")
add("Gemma 4 E2B Q4_0 - CPU only - 6 September 2026", "SubtitleTom")
add(f'<b>Tom produced correct artifacts in {rate("tom")} trials.</b> This exploratory comparison used eight small local tasks, repeated with two seeds in four modes. Failed trials are included.')
add("Prepared for peer inspection. Developer-authored; not peer reviewed or a SWE-bench score. Final scores use corrected scorer V2; the original records and correction note are retained.", "SmallTom")
heading("Same model, four ways to use it")
chart=Drawing(480,160)
for i,a in enumerate(["direct","minimal","tom","aider"]):
    s=stats["aggregate"][a]
    y=131-i*37
    chart.add(String(0,y+5,names[a],fontName="Helvetica",fontSize=10,fillColor=navy))
    chart.add(Rect(118,y,260,20,fillColor=light,strokeColor=None))
    chart.add(Rect(118,y,260*s["passed"]/s["n"],20,fillColor=teal if a=="tom" else colors.HexColor("#6C9095"),strokeColor=None))
    chart.add(String(390,y+5,rate(a),fontName="Helvetica-Bold",fontSize=10,fillColor=navy))
story.append(chart)
add("Primary outcome: correct final contents, unchanged source files and no unexpected file. Direct contents are saved by the evaluator; that mode does not demonstrate autonomous file operation.", "SmallTom")
heading("What was tested")
table([["Category", "Tasks", "Trials per mode"], ["Small JavaScript repairs",4,8],["Local data transformations",2,4],["Exact files and quoted instructions",2,4]], [300,70,120])
heading("The host")
add("Intel Xeon E3-1245 v5 (Skylake), approximately 32 GB RAM, Windows x64. Two inference and batch threads; 4,096-token context; Q8_0 KV cache; zero GPU layers. The operating system and harness were not restricted to two logical processors.")
add("Official intended target: eighth-generation Intel with Windows 11. This run observed one Skylake development machine; it does not qualify the target fleet or low-memory PCs.", "SmallTom")

story.append(PageBreak())
add("02 / RESULTS YOU CAN AUDIT", "SmallTom")
add("Success and completion<br/>are different", "TitleTom")
table([["Mode","Correct artifacts","Completed, incorrect"]]+[[names[a],rate(a),stats["aggregate"][a]["completedIncorrect"]] for a in names],[190,175,125])
add("A completed task state is not proof of a correct deliverable. For the direct mode, completion only means a normally ended model response.", "SmallTom")
heading("Every task, both seeds")
table([["Task","Direct","Minimal","Tom","Aider"]]+[[r["case"]]+[str(r[a])+"/2" for a in names] for r in stats["caseMatrix"]],[210,70,70,70,70])
heading("Paired comparisons")
table([["Tom compared with","Difference","Win / loss / tie"]]+[[names[a],f'{v["delta"]*100:+.2f} points',f'{v["wins"]} / {v["losses"]} / {v["ties"]}'] for a,v in stats["comparisons"].items()],[210,140,140])
add("There are eight unique tasks, not 16 independent task types. The full report includes an exploratory bootstrap that resamples whole tasks with both seeds retained. This small convenience sample cannot establish broad superiority or a population success rate.", "SmallTom")

story.append(PageBreak())
add("03 / APPLICATION REVIEW", "SmallTom")
add("Good local foundations.<br/>Clear capability gaps.", "TitleTom")
heading("Strengths")
add("A small Node supervisor, SQLite journal and native CPU model worker fit the older-Windows goal. Hash checks, constrained action formatting, create-only writes, snapshots and interrupted-action tracking are useful reliability mechanisms. The pre-run deterministic suite passed 63 of 63 checks; that is implementation evidence, not model-task success.")
heading("1. File tracking misses software extensions")
add("The evidence controller omits .cjs and several other software extensions from output recognition, and omits JavaScript from required source reads. All four repair tasks exercise .cjs, so this weakness is overrepresented in the suite. Missing output or unread source can fail to activate the intended completion gate.")
heading("2. Verified bytes can still be wrong")
add("Observed failures include a missing function export, input mutation, absent output, and invalid or incorrect data. A successful write only verifies stored bytes. Software workflows need independent execution or approved project tests before claiming working code.")
heading("3. Broad execution needs stronger boundaries")
add("The product's tools inherit user-account access. The work folder is not a sandbox. These trials use a restrictive evaluator permission policy; their quoted-instruction result does not establish safety with unrestricted shell access.")
heading("4. Portability is a separate qualification")
add("The model is 3.35 GB on disk; the optional projector is approximately 0.99 GB. Loader headroom guards and worker memory samples do not prove operation on 4 GB or 8 GB PCs. Physical target systems, browser/OS overhead, paging and endurance need measurement.")
if stats.get("extensionDiagnostic"):
    d=stats["extensionDiagnostic"]
    add(f'Separate post-hoc diagnostic: changing .cjs to .js increased nonempty delivery from {d["originalCjsNonemptyDeliverables"]}/8 to {d["nonemptyDeliverables"]}/8, but functional success stayed {d["passed"]}/8. Filename recognition alone did not solve the coding failures. These trials are excluded from the primary scores.', "SmallTom")
heading("Next development priorities")
add("Fix general file-path recognition; distinguish saved files from passing tests; make isolated journal recall work; then repeat a broader frozen suite and qualify physical eighth-generation Windows 11 machines. Preserve this run as the pre-fix baseline.")

story.append(PageBreak())
add("04 / SCOPE AND USE", "SmallTom")
add("Publish the scope<br/>with the number", "TitleTom")
heading("Reproducibility")
add("Seeds 42 and 43; temperature 0.2; top-p 0.95; top-k 64; thinking disabled. Tool and peer modes share ceilings of 24 calls, 12,288 output tokens, 15 active minutes and 2,048 tokens per response. Direct mode is one response. Aider 0.86.2 whole-file mode runs after the internal comparison, using the same local model configuration.")
add("Tasks were frozen before inference. A documented scorer correction supports valid fixture imports and applies equally to all saved outputs; no model outputs were regenerated. Reference and negative checks pass. The package includes all trials, original scores, corrected assertions, prompts, source hashes and reproduction scripts.")
heading("Not run - no scores assigned")
table([["Evaluation","Reason"],["SWE-bench","Official repository/container environment not available; Docker command absent."],["Aider Polyglot","Complete multi-language benchmark environment not provisioned. Aider itself was tested on this local suite."],["Eldon","Published E4B/GPU-oriented setup was not validated for this exact E2B Q4 CPU configuration."],["Vision, live web, long repositories","Outside this short text/file suite; no extrapolation from its results."],["Physical hardware matrix","Only the Skylake development host was available."]],[135,355])
heading("A defensible marketing statement")
add(f'"Tom runs Gemma 4 E2B Q4 locally on CPU. In a developer-run study on a Skylake Xeon with 32 GB RAM and two inference threads, it produced correct artifacts in {stats["aggregate"]["tom"]["passed"]} of 16 attempts across eight small local tasks repeated twice. The report includes failures and an Aider comparison."')
add("Do not call this peer reviewed, a SWE-bench score, proof of general harness uplift, or qualification of every older PC. The full report and methodology must accompany any score claim.", "SmallTom")
add('<b>Sources:</b> <link href="https://www.swebench.com/SWE-bench/guides/evaluation/" color="#167A70">SWE-bench evaluation</link>; <link href="https://github.com/Aider-AI/aider/blob/main/benchmark/README.md" color="#167A70">Aider benchmark</link>; <link href="https://github.com/OsbornVentures/Eldon/blob/main/SETUP.md" color="#167A70">Eldon setup</link>; <link href="https://learn.microsoft.com/en-us/windows-hardware/design/minimum/supported/windows-11-supported-intel-processors" color="#167A70">Microsoft CPU list</link>. Evidence: REPORT.md, trials.csv, statistics.json, raw result records and source-snapshot/.', "SmallTom")

def page(canvas, doc):
    canvas.setStrokeColor(teal)
    canvas.setLineWidth(1)
    canvas.line(50, A4[1]-35, A4[0]-50, A4[1]-35)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(muted)
    canvas.drawString(50,26,"TOM E2B Q4 / exploratory capability study / 06 Sep 2026")
    canvas.drawRightString(A4[0]-50,26,str(doc.page))

doc=SimpleDocTemplate(str(output),pagesize=A4,rightMargin=50,leftMargin=50,topMargin=52,bottomMargin=45,
                      title="Tom E2B Q4 - Local capability comparison",author="Tom development evaluation")
doc.build(story,onFirstPage=page,onLaterPages=page)
print(output)
