/**
 * Export.gs — writes a report into a new Google Sheet in the owner's Drive
 * and shares it (edit) with the staff member who asked for it.
 */

function buildExportSpreadsheet_(title, r, scope) {
  var staffEmail = currentEmail_();
  var out = SpreadsheetApp.create(title);
  var head = function (sh, rowNum, n) {
    sh.getRange(rowNum, 1, 1, n).setFontWeight('bold').setBackground('#e8eef7');
  };
  var write = function (sh, startRow, rows) {
    if (!rows.length) return startRow;
    var width = Math.max.apply(null, rows.map(function (x) { return x.length; }));
    rows = rows.map(function (x) { while (x.length < width) x.push(''); return x.map(sanitizeCell_); });
    sh.getRange(startRow, 1, rows.length, width).setValues(rows);
    return startRow + rows.length;
  };
  var pctText = function (p) { return p === null || p === undefined ? '' : p + '%'; };
  var flagText = function (f) { return f === 'strength' ? 'Strength' : f === 'gap' ? 'Gap' : f === 'developing' ? 'Developing' : ''; };

  // ---- Summary ----
  var sum = out.getSheets()[0].setName('Summary');
  var row = write(sum, 1, [
    [title], [''],
    ['Scope', scope], ['Window', r.window],
    ['Students completed', r.summary.completed + ' of ' + r.summary.rostered + ' on class lists'],
    ['Average score', pctText(r.summary.average)],
    ['Strength threshold', '≥ ' + r.thresholds.strength + '%'], ['Gap threshold', '< ' + r.thresholds.gap + '%'],
    ['Overall strengths', r.strengths.join(', ') || '—'], ['Overall gaps', r.gaps.join(', ') || '—'], ['']
  ]);
  sum.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  head(sum, row, 3);
  row = write(sum, row, [['Strand', '% correct', 'Status']].concat(
    r.strands.map(function (s) { return [s.strand, pctText(s.percent), flagText(s.flag)]; })));
  row = write(sum, row + 1, [['Score band', 'Students']].concat(
    r.summary.bands.map(function (b) { return [b.label, b.count]; })));
  head(sum, row - r.summary.bands.length - 1, 2);
  sum.autoResizeColumns(1, 3);

  // ---- Breakdown by grade or class ----
  if (r.groups.length) {
    var gs = out.insertSheet(r.groupBy === 'grade' ? 'By Grade' : 'By Class');
    var strandNames = unionStrands_(r.groups.map(function (g) { return g.strands; }));
    write(gs, 1, [[r.groupBy === 'grade' ? 'Grade' : 'Class', 'Students', 'Average'].concat(strandNames)]
      .concat(r.groups.map(function (g) {
        return [g.name, g.students, pctText(g.average)].concat(strandNames.map(function (s) {
          var hit = g.strands.filter(function (x) { return x.strand === s; })[0];
          return hit ? pctText(hit.percent) : '';
        }));
      })));
    head(gs, 1, 3 + strandNames.length);
    gs.setFrozenRows(1);
    gs.autoResizeColumns(1, 3 + strandNames.length);
  }

  // ---- Item analysis ----
  var ia = out.insertSheet('Question Analysis');
  write(ia, 1, [['Question ID', 'Grade', 'Strand', 'Expectation', 'Question', '% correct', 'Status',
                 'Answer', 'A', 'B', 'C', 'D', 'Blank', 'Most common wrong answer',
                 'Correct (green)', 'Less correct (yellow)', 'Pretty wrong (orange)', 'Wrongest (red)']]
    .concat(r.items.map(function (it) {
      return [it.id, it.grade, it.strand, it.expectation, it.question, pctText(it.percent), flagText(it.flag),
              it.correct, it.choices.A, it.choices.B, it.choices.C, it.choices.D, it.choices.blank,
              it.commonWrong ? it.commonWrong.choice + ': ' + it.commonWrong.text + ' (' + it.commonWrong.count + ')' : '']
              .concat(it.levels.map(function (l) { return l.count; }));
    })));
  head(ia, 1, 18);
  ['#d9f2e0', '#fdf1c7', '#fde0c8', '#f9d3d0'].forEach(function (c, i) { ia.getRange(1, 15 + i).setBackground(c); });
  ia.setFrozenRows(1);
  ia.setColumnWidth(5, 380);
  ia.getRange('E:E').setWrap(true);

  // ---- Students ----
  var stSheet = out.insertSheet('Students');
  var sNames = unionStrands_(r.students.map(function (s) { return s.strands; }));
  write(stSheet, 1, [['Student', 'Grade', 'Class', 'Score', '%', 'Close calls', 'Far off'].concat(sNames).concat(['Strengths', 'Gaps'])]
    .concat(r.students.map(function (s) {
      return [s.name, s.grade, s.className, s.score + '/' + s.total, pctText(s.percent), s.close, s.farOff]
        .concat(sNames.map(function (n) {
          var hit = s.strands.filter(function (x) { return x.strand === n; })[0];
          return hit ? pctText(hit.percent) + ' (' + hit.correct + '/' + hit.total + ')' : '';
        }))
        .concat([s.strengths.join(', '), s.gaps.join(', ')]);
    })));
  head(stSheet, 1, 9 + sNames.length);
  stSheet.setFrozenRows(1);
  stSheet.autoResizeColumns(1, 9 + sNames.length);

  // ---- Trends ----
  if (r.trend.length) {
    var tr = out.insertSheet('Trends');
    var tNames = unionStrands_(r.trend.map(function (t) { return t.strands; }));
    write(tr, 1, [['Window', 'Students', 'Average'].concat(tNames)].concat(r.trend.map(function (t) {
      return [t.window, t.students, pctText(t.average)].concat(tNames.map(function (n) {
        var hit = t.strands.filter(function (x) { return x.strand === n; })[0];
        return hit ? pctText(hit.percent) : '';
      }));
    })));
    head(tr, 1, 3 + tNames.length);
  }

  // ---- Not completed ----
  var nc = out.insertSheet('Not Completed');
  write(nc, 1, [['Student', 'Grade', 'Class']].concat(r.notCompleted.map(function (s) {
    return [s.name, s.grade, s.className];
  })));
  head(nc, 1, 3);

  if (staffEmail && staffEmail !== normEmail_(Session.getEffectiveUser().getEmail())) {
    out.addEditor(staffEmail);
  }
  return out.getUrl();
}

function unionStrands_(lists) {
  var seen = {};
  lists.forEach(function (l) { l.forEach(function (s) { seen[s.strand] = true; }); });
  return STRANDS.filter(function (s) { return seen[s]; })
    .concat(Object.keys(seen).filter(function (s) { return STRANDS.indexOf(s) < 0; }));
}
