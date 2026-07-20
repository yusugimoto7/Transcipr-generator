/**
 * Study Plan / SOP builder questions (max 7).
 * Each question offers clickable pre-written answers (multi-select) plus a free
 * notes field, so applicants can build a strong Statement of Purpose quickly
 * without writing from a blank page.
 */

export const SOP_QUESTIONS = [
  {
    id: 'whyCanada',
    question: 'Why do you want to study in Canada?',
    options: [
      'World-class education quality',
      'Safe, welcoming, multicultural society',
      'Strong post-graduation work options (PGWP)',
      'This program is not available at home',
      'Better value than the US / UK',
      'Aligns with my career field',
    ],
  },
  {
    id: 'whyProgram',
    question: 'Why this program / field of study?',
    options: [
      'Builds directly on my previous studies',
      'Fills a skills gap for my target career',
      'Strong industry demand in this field',
      'Long-term passion and interest',
      'Includes hands-on / co-op components',
      'Reputation of the curriculum',
    ],
  },
  {
    id: 'whySchool',
    question: 'Why this specific institution?',
    options: [
      'High ranking / strong reputation',
      'Curriculum matches my goals',
      'Co-op / internship opportunities',
      'Location and campus',
      'Affordable tuition or scholarship',
      'Recommended by alumni / advisor',
    ],
  },
  {
    id: 'background',
    question: 'How does this connect to your background?',
    options: [
      'Continues my academic field',
      'Planned career switch into a growing field',
      'Adds credentials my current job needs',
      'Builds on my work experience',
      'First formal training in this area',
    ],
  },
  {
    id: 'career',
    question: 'What is your career goal after graduation?',
    options: [
      'Return home and work in my field',
      'Join or expand my family business',
      'Start my own business',
      'Work in a specific industry',
      'Pursue further studies, then work',
      "Contribute to my country's development",
    ],
  },
  {
    id: 'ties',
    question: 'What ties will bring you back home?',
    options: [
      'Close family (parents / siblings)',
      'Property or assets in my name',
      'A job or job offer waiting',
      'A family business to run',
      'Financial dependents',
      'Strong community / cultural roots',
    ],
  },
  {
    id: 'concerns',
    question: 'Anything to explain to the visa officer?',
    options: [
      'A past visa refusal',
      'A gap in my studies',
      'Change of field from previous studies',
      'Older-than-typical student',
      'Funding from family / sponsor',
      'Nothing specific',
    ],
  },
];

/** Turn stored builder answers into a readable block for the SOP prompt. */
export function answersToText(answers = {}) {
  const lines = [];
  for (const q of SOP_QUESTIONS) {
    const a = answers[q.id];
    if (!a) continue;
    const picked = Array.isArray(a.selected) ? a.selected : [];
    const note = (a.note || '').trim();
    if (!picked.length && !note) continue;
    let line = `- ${q.question}`;
    if (picked.length) line += ` Selected: ${picked.join('; ')}.`;
    if (note) line += ` Applicant's own words: "${note}"`;
    lines.push(line);
  }
  return lines.join('\n');
}
