/*
 * The Forge · Math Check-In: Google Sheet tools
 * Copyright (c) 2026 Ryan Adams and Natasha Allen. All rights reserved.
 * Not to be copied, modified or distributed without the authors' written permission.
 */
/**
 * Config.gs — sheet names, column layouts and default settings.
 *
 * SECURITY NOTE: In Apps Script, any top-level function WITHOUT a trailing
 * underscore can be called from the browser via google.script.run.
 * Every helper in this project ends in "_" so only the intentional API
 * functions in Api.gs are reachable from the web page.
 */

var SHEET = {
  SETTINGS: 'Settings',
  QUESTIONS: 'Questions',
  STAFF: 'Staff',
  ROSTER: 'Roster',
  ATTEMPTS: 'Attempts',
  RESPONSES: 'Responses',
  AUDIT: 'Audit Log'
};

var HEADERS = {
  'Settings':  ['Key', 'Value', 'Notes'],
  'Questions': ['QuestionID', 'Grade', 'Strand', 'Expectation', 'Question', 'ImageURL',
                'OptionA', 'OptionB', 'OptionC', 'OptionD', 'Correct', 'WrongRank', 'Active', 'Notes',
                'OptionAImage', 'OptionBImage', 'OptionCImage', 'OptionDImage'],
  'Staff':     ['Email', 'Name', 'Role'],
  'Roster':    ['StudentEmail', 'StudentName', 'Grade', 'Class', 'TeacherEmail'],
  'Attempts':  ['AttemptID', 'Window', 'StudentEmail', 'StudentName', 'Grade', 'Class',
                'StartedAt', 'SubmittedAt', 'Score', 'Total', 'Percent'],
  'Responses': ['AttemptID', 'Window', 'StudentEmail', 'Grade', 'Class', 'QuestionID',
                'Strand', 'Expectation', 'Chosen', 'IsCorrect'],
  'Audit Log': ['Timestamp', 'Email', 'Action', 'Details']
};

/** Ontario Mathematics (2020) strands that multiple-choice items can assess. */
var STRANDS = ['Number', 'Algebra', 'Data', 'Spatial Sense', 'Financial Literacy'];

var CHOICES = ['A', 'B', 'C', 'D'];

/**
 * How wrong each answer is, matching the Forge colour coding.
 * WrongRank on the Questions tab lists the wrong letters from closest to furthest,
 * e.g. "C,A,D" = C is "less correct" (yellow), A "pretty wrong" (orange), D "wrongest" (red).
 */
var LEVELS = [
  { key: 'correct', label: 'Correct', colour: 'green' },
  { key: 'close', label: 'Less correct', colour: 'yellow' },
  { key: 'wrong', label: 'Pretty wrong', colour: 'orange' },
  { key: 'wrongest', label: 'Wrongest', colour: 'red' }
];

var DEFAULT_SETTINGS = [
  ['SchoolName', 'Winchester P.S.', 'Shown at the top of every page.'],
  ['StudentDomains', 'ddsbstudent.ca', 'Comma-separated email domains allowed to take assessments.'],
  ['StaffDomains', 'ddsb.ca', 'Comma-separated domains staff accounts must use (staff must ALSO be listed on the Staff tab).'],
  ['CurrentWindow', 'Fall 2026', 'Saved with every attempt. Change it each assessment period (e.g. Winter 2027) to see trends.'],
  ['AssessmentOpen', 'TRUE', 'Set to FALSE to stop students starting or submitting.'],
  ['AllowRetakes', 'FALSE', 'FALSE = one submitted attempt per student per window.'],
  ['ShowScoreToStudent', 'FALSE', 'TRUE = students see their score when they finish.'],
  ['ShuffleQuestions', 'TRUE', 'Shuffle question order for each student.'],
  ['StrengthThreshold', '75', '% correct at or above this is flagged as a strength.'],
  ['GapThreshold', '60', '% correct below this is flagged as a gap.']
];
