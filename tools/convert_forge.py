"""
Converts "The Winchester Forge" assessment workbook (G2S..G6S tabs) into the
app's Questions tab format.  Usage:
    python3 tools/convert_forge.py <exported-sheet.txt> <out.csv>
The export must contain the "## Sheet name: G#S" sections as CSV.
Each S tab has: a "Questions:" row, then Correct (green), Less Correct (yellow),
Pretty Wrong (orange) and Wrongest (red) answer rows.
"""
import csv, io, re, sys, random, json
from fractions import Fraction

src, out = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read()
sections = {}
for m in re.finditer(r'^## Sheet name: (\w+)\n(.*?)(?=^## Sheet name: |\Z)', text, re.S | re.M):
    sections[m.group(1)] = m.group(2)

N, A, D, S, F = 'Number', 'Algebra', 'Data', 'Spatial Sense', 'Financial Literacy'
STRANDS = {
    2: [N, N, N, N, A, A, D, D, D, D, S, S, S, S, F, F, F, F],
    3: [N, N, N, N, A, A, A, A, D, D, D, D, S, S, S, S, F, F],
    4: [N, N, N, N, N, A, N, N, F, F, D, N, N, N, N, S, S, S, S, S, S, S, S, S, D, D, D, D],
    5: [N] * 20 + [A, A, A, D, D, D, S, S, S, F, F, F],
    6: None,  # taken from the N-/A-/D-/S-/F- prefixes
}
PREFIX = {'N': N, 'A': A, 'D': D, 'S': S, 'F': F}

# Questions that refer to a picture/graph/table from the Google Form (1-based position).
NEEDS_IMAGE = {3: {2, 5, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18},
               4: {23, 27, 28}, 5: {25, 29}, 6: {2, 3, 5, 10, 12, 13, 15, 17}}

# Wording fixes (spelling/grammar only; math content untouched). (grade, pos) -> list of (old, new)
FIXES = {
    (2, 8): [('a survey the class', 'a survey of the class')],
    (2, 10): [("'Heads\"", '"heads"')],
    (2, 12): [('centimeters', 'centimetres'), ('1 meter', '1 metre')],
    (2, 14): [('themometer', 'thermometer')],
    (4, 15): [('water? How', 'water. How')],
    (4, 16): [('at 3:10pm when they will be ready?', 'at 3:10 pm, when will they be ready?')],
    (5, 29): [('rectangle prism shown.', 'rectangular prism shown?')],
}
REVIEW = {
    (4, 21): 'Says "Name all" but students pick one answer; the key is "Cube", but a rectangular prism fits the question better and is not an option.',
    (5, 10): '"Apple adds 104 apples each day" reads oddly. Maybe "A store adds…"?',
    (5, 15): 'Distractor "$0.17" has a dollar sign; probably meant 0.17.',
    (5, 30): 'Two answer choices are identical ("$42.50"). Replace one, e.g. "$4205" or "$42.5".',
    (6, 2): 'Has no question text (it was all in the Form image).',
    (6, 3): 'Question text is cut off ("What number is greater than").',
    (6, 5): 'Has no question text (it was all in the Form image).',
}

def clean_text(t):
    t = t.replace('\r', '')
    t = re.sub(r'^\s*[NADSF]\s*-\s*Question\s*#\s*\d+\s*', '', t)   # G6 prefixes
    t = re.sub(r'^\s*\d+\.\s+', '', t)                               # "12. "
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()

def num(v):
    s = v.strip().replace(' ', ' ')
    s = re.sub(r'[\$¢%°]', '', s)
    s = re.sub(r'\s*(cm|mm|mL|L|markers|blocks|days|tiles|goals|steps|weeks|cubic centimetres)$', '', s)
    s = s.replace(' ', '')
    try:
        if re.fullmatch(r'\d+/\d+', s): return float(Fraction(s))
        return float(s)
    except ValueError:
        return None

rows, report = [], []
for g in range(2, 7):
    sec = list(csv.reader(io.StringIO(sections[f'G{g}S'])))
    get = lambda label: next(r for r in sec if r and r[0].startswith(label))
    qs, cor, yel, ora, red = (get(x)[4:] for x in ('Questions:', 'Correct', 'Less Correct', 'Pretty Wrong', 'Wrongest'))
    for i, raw in enumerate(qs):
        if not raw.strip(): continue
        pos = i + 1
        qid = f'G{g}-{pos:03d}'
        if g == 6:
            m = re.match(r'\s*([NADSF])', raw); strand = PREFIX[m.group(1)]
        else:
            strand = STRANDS[g][i]
        qtext = clean_text(raw)
        if (g, pos) in {(6, 2), (6, 5)}:
            qtext = 'Look at the picture. Choose the correct answer.'
        ranked = [cor[i].strip(), yel[i].strip(), ora[i].strip(), red[i].strip()]  # 0 = correct .. 3 = wrongest
        for old, new in FIXES.get((g, pos), []):
            qtext = qtext.replace(old, new); ranked = [r.replace(old, new) for r in ranked]
        # Choose display order A–D.
        if all(re.fullmatch(r'[A-D]', r) for r in ranked):
            order = sorted(range(4), key=lambda k: ranked[k])                    # options printed in the picture
        elif all(re.match(r'[A-D] -', r) for r in ranked):
            order = sorted(range(4), key=lambda k: ranked[k][0])
        elif all(num(r) is not None for r in ranked):
            order = sorted(range(4), key=lambda k: num(ranked[k]))              # numbers smallest → largest
        else:
            order = list(range(4)); random.Random(qid).shuffle(order)
        letters = 'ABCD'
        opts = [ranked[k] for k in order]
        correct = letters[order.index(0)]
        wrong_rank = ','.join(letters[order.index(lvl)] for lvl in (1, 2, 3))
        needs_img = pos in NEEDS_IMAGE.get(g, set())
        notes = []
        if needs_img: notes.append('NEEDS IMAGE from the Google Form: add a Drive link in ImageURL, then tick Active.')
        if (g, pos) in REVIEW: notes.append('REVIEW: ' + REVIEW[(g, pos)])
        if (g, pos) in FIXES: notes.append('Wording tidied: ' + '; '.join(f'"{o}" → "{n}"' for o, n in FIXES[(g, pos)]))
        rows.append({'QuestionID': qid, 'Grade': g, 'Strand': strand, 'Expectation': '', 'Question': qtext, 'ImageURL': '',
                     'OptionA': opts[0], 'OptionB': opts[1], 'OptionC': opts[2], 'OptionD': opts[3],
                     'Correct': correct, 'WrongRank': wrong_rank,
                     'Active': 'FALSE' if needs_img or (g, pos) in {(6, 2), (6, 3), (6, 5)} else 'TRUE',
                     'Notes': ' '.join(notes)})

cols = ['QuestionID', 'Grade', 'Strand', 'Expectation', 'Question', 'ImageURL', 'OptionA', 'OptionB', 'OptionC', 'OptionD',
        'Correct', 'WrongRank', 'Active', 'Notes']
with open(out, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
summary = {}
for r in rows:
    s = summary.setdefault(r['Grade'], {'total': 0, 'active': 0}); s['total'] += 1; s['active'] += r['Active'] == 'TRUE'
print(json.dumps(summary))
