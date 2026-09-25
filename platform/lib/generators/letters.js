import { complete } from '../ai';
import { factsText } from '../schema';
import { getAppType, lettersFor, primaryLetter } from '../appTypes';
import { answersToText } from '../sopQuestions';
import { pronouns, BOILERPLATE } from '../applicant';
import { getFirm, signatureBlock } from '../firm';
import { buildChecklist } from '../checklist';
import { buildSopPrompt } from './sop';
import { generateFinancialCoverLetter, generateFinancialSummary, generateSubmissionLetter } from './coverdocs';

/**
 * One entry point for every letter the platform drafts, for every application
 * type. The type registry (lib/appTypes.js) says which letters apply; this
 * module knows how to write each `kind`.
 *
 * Study-permit letters keep their proven house-style prompts (sop.js,
 * coverdocs.js). Everything else is built here from the intake facts, the
 * guided-question answers and, when attached, the applicant's documents.
 */

const NO_INVENT = `You NEVER invent facts — use only the details provided, and where a
detail is genuinely missing write a neutral placeholder in [SQUARE BRACKETS] for the
applicant to complete. Plain text with **bold** section headings, no preamble.`;

/** The letter definition for a generated-document key, or null. */
export function letterSpec(app, key) {
  return lettersFor(app).find((l) => l.key === key) || null;
}

/** Upload categories most useful for a given letter kind. */
const DOC_CATS = {
  study: ['cv', 'loa', 'transcripts', 'certificates', 'job-offer', 'language', 'sop'],
  'study-minor': ['loa', 'transcripts', 'spouse-status', 'consent-letter', 'questionnaire'],
  owp: ['spouse-status', 'inviter-docs', 'marriage-cert', 'status-in-canada', 'cv', 'employment-letter', 'questionnaire'],
  visit: ['invitation-letter', 'host-docs', 'employment-letter', 'flight', 'accommodation', 'cv', 'title-deeds', 'questionnaire'],
  pgwp: ['completion-letter', 'transcripts', 'status-in-canada', 'job-offer', 'employment-letter', 'questionnaire'],
  'study-inside': ['status-in-canada', 'loa', 'transcripts', 'deposit', 'last-entry', 'questionnaire'],
  'visitor-record': ['status-in-canada', 'last-entry', 'ties-docs', 'proof-of-funds', 'host-docs', 'questionnaire'],
  reconsideration: ['refusal-letter', 'sop', 'proof-of-funds', 'employment-letter'],
  invitation: ['host-docs', 'invitation-letter', 'inviter-docs', 'spouse-status', 'supporter-income'],
  'business-visit': ['invitation-letter', 'business-docs', 'employment-letter', 'business-financials', 'flight', 'accommodation', 'questionnaire'],
  'business-invitation': ['invitation-letter', 'business-docs'],
  c11: ['business-plan', 'business-docs', 'business-financials', 'business-contracts', 'business-employees', 'business-premises', 'cv', 'questionnaire'],
  'super-visa': ['host-docs', 'inviter-docs', 'medical-insurance', 'invitation-letter', 'supporter-income', 'ties-docs', 'questionnaire'],
  'iranian-owp': ['status-in-canada', 'last-entry', 'employment-letter', 'job-offer', 'cv', 'questionnaire'],
  explanation: ['refusal-letter'],
};

export function selectLetterDocs(app, letter, max = 8) {
  const docs = app.documents || [];
  const cats = DOC_CATS[letter.kind] || [];
  const relevant = docs.filter((d) => cats.includes(d.category));
  return (relevant.length ? relevant : docs).slice(0, max);
}

function header(app) {
  const d = app.data || {};
  const t = getAppType(app.type);
  const p = pronouns(d);
  return {
    d,
    t,
    p,
    name: `${d.givenName || ''} ${d.familyName || ''}`.trim(),
    facts: factsText(d, app.type),
    builder: answersToText(app.sopAnswers || {}, primaryLetter(app.type).kind),
  };
}

/** Build { system, instruction } for a letter. Shared by buffered + streaming paths. */
export function buildLetterPrompt(app, letter, hasDocs = false) {
  if (letter.kind === 'study') return buildSopPrompt(app, hasDocs);

  const { d, t, p, name, facts, builder } = header(app);
  const docsNote = hasDocs
    ? "\n\nThe applicant's uploaded documents are attached — read them and pull concrete facts (names, dates, employers, amounts, permit numbers) so the letter is specific and true."
    : '';
  const builderNote = builder
    ? `\n\nThe applicant answered these guided questions — weave the selections and their own words naturally into the letter (do not list them verbatim):\n${builder}`
    : '';

  const K = letter.kind;

  if (K === 'study-minor') {
    return {
      system: `You draft Study Plans for MINOR children applying for Canadian study permits, written in the first person by the accompanying parent on the child's behalf. ${NO_INVENT}`,
      instruction: `Write a "Study Plan" (600-900 words) addressed "Dear Visa Officer,". Sections:
**About my child and our family** — the child, the accompanying parent's status in Canada (${d.parentStatusCanada || '[status]'}), the other parent's consent, who cares for the child.
**School arrangements in Canada** — school/board, grade, start date, why this school.
**Why studying in Canada now** — keeping the family together while the parent studies/works; the child's educational continuity.
**Financial support** — who pays tuition and living costs, with amounts.
**Return plans** — the family's intention at the end of the parent's authorized stay.
Close respectfully, signed by the parent for the child.

Application type: ${t.title}
Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'owp') {
    return {
      system: `You are an expert Canadian immigration consultant drafting first-person Statements of Purpose for SPOUSAL OPEN WORK PERMIT applications made inside Canada (IMM 5710). You address the officer's core concerns: a genuine relationship, the spouse's qualifying status (full-time DLI student at an eligible level, or skilled worker), the applicant's own lawful status, and temporary intent. ${NO_INVENT}`,
      instruction: `Write an EXTENSIVE "Statement of Purpose" (900-1,300 words) addressed "Dear Visa Officer,", first person as ${name || 'the applicant'}. Sections:
**Introduction** — who I am, my current status in Canada (${d.currentStatusCanada || '[status]'}, expiring ${d.permitExpiry || '[date]'}), and what I am applying for.
**My relationship with my spouse** — how we met, marriage date (${d.marriageDate || '[date]'}), cohabitation, children; genuine and continuing.
**My spouse's status in Canada** — ${d.inviterName || '[spouse]'}: ${d.inviterStatus || '[status]'} at ${d.inviterInstitution || '[institution/employer]'}, ${d.inviterProgramOrJob || '[program/job]'}; why this makes me eligible (cite the eligibility criteria plainly).
**My background and what I will do in Canada** — education, work experience, the kind of work I intend to do, how I will support our household.
**Our plans and ties** — what we will do when my spouse's permit ends; family, property and commitments at home; commitment to comply with Canadian law.
Close with "Sincerely, ${name || '[name]'}". Use pronouns ${p.subj}/${p.pos} for the applicant where third person is needed.

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'visit') {
    const isOwp = t.key === 'owp-outside';
    return {
      system: `You are an expert Canadian immigration consultant drafting first-person "Purpose of Travel" letters for ${isOwp ? 'accompanying-spouse work permit applications made from outside Canada' : 'visitor visa (TRV) applications'}. You address the officer's concerns: a clear purpose, sufficient funds, and strong ties proving the applicant will leave Canada at the end of the authorized stay (IRPA s.179/s.216). ${NO_INVENT}`,
      instruction: `Write an EXTENSIVE "Purpose of Travel" letter (900-1,300 words) addressed "Dear Visa Officer,", first person as ${name || 'the applicant'}. Sections:
**Introduction** — who I am, citizenship, occupation, and what I am applying for.
**Purpose of my ${isOwp ? 'travel and work' : 'visit'}** — ${isOwp ? `joining my spouse ${d.inviterName || '[spouse]'} (${d.inviterStatus || '[status]'} at ${d.inviterInstitution || '[institution/employer]'}); what I will do in Canada` : `${d.visitPurpose || '[purpose]'}; dates ${d.visitFrom || '[from]'} to ${d.visitTo || '[to]'}; itinerary; who I am visiting (${d.hostName || 'no host'}${d.hostRelationship ? ', my ' + d.hostRelationship : ''})`}.
**My background** — education and employment history with employers, roles and dates.
**Financial capacity** — who pays, funds available, assets; ${BOILERPLATE.sanctionsTransfer}
**Strong ties to my home country** — job / business / approved leave, property, family members staying behind, travel history and compliance with previous visas.
**Conclusion** — commitment to respect the conditions of stay and leave Canada by ${isOwp ? 'the end of my authorized period' : d.visitTo || '[date]'}.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'study-inside') {
    return {
      system: `You draft first-person Statements of Purpose for study permit applications made from INSIDE Canada (IMM 5709): extensions, changes of school or level, changes of conditions, and restorations of status. The officer's concerns are different from a first application: whether the applicant actively pursued studies on the permit they already hold, why more time or a change is needed, that funds remain sufficient, and that the stay stays temporary. This is an in-Canada decision — there is no visa counterfoil and no port-of-entry exam. ${NO_INVENT}`,
      instruction: `Write a "Statement of Purpose" (800-1,200 words) addressed "Dear Officer,", first person as ${name || 'the applicant'}. Sections:
**My current status and what I am applying for** — study permit expiring ${d.permitExpiry || '[date]'}, last entry ${d.lastEntryDate || '[date]'}, and the request: ${d.studyInsideReason || '[reason]'}.
**How I have pursued my studies** — ${d.currentDli || '[school]'}: semesters completed (${d.semestersCompleted || '[n]'}), academic standing (${d.academicStanding || '[standing]'}), full-time enrolment; explain any break honestly${d.studyGapExplanation ? ` (${d.studyGapExplanation})` : ''}.
**Why I need this extension or change** — the concrete reason (program length, co-op, course availability, a better-suited program or school${d.newDli ? `, moving to ${d.newDli}` : ''}), and the new end date ${d.newProgramEnd || '[date]'}.
${d.restorationReason ? '**Restoration of status** — how and when my status lapsed, that I am applying within 90 days, and what I have done since.\n' : ''}**Financial capacity for the remaining studies** — tuition still owing, living costs, and who pays.
**My plans after graduation** — and my commitment to comply with the conditions of the permit and leave Canada at the end of my authorized stay.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'visitor-record') {
    return {
      system: `You draft first-person letters asking IRCC to EXTEND A STAY IN CANADA AS A VISITOR (IMM 5708, Visitor Record). This is an in-Canada status application decided by a Canadian processing centre — it issues a Visitor Record, NOT a visa, and the passport is not submitted for a counterfoil. Never describe it as a visa application or mention re-entry to Canada. The officer's concerns: a genuine and temporary reason to stay longer, enough money for the extended stay, and that the applicant will leave at the end. ${NO_INVENT}`,
      instruction: `Write a "Letter of Explanation — Extension of Stay" (600-900 words) addressed "Dear Officer,", first person as ${name || 'the applicant'}. Sections:
**My current status** — how and when I entered Canada (${d.lastEntryDate || '[date]'}), my current status (${d.currentStatusCanada || '[status]'}) and when it expires (${d.permitExpiry || '[date]'}); confirm this application is made before that date${d.extendUntil ? '' : ''}.
**Why I am asking to stay longer** — ${d.extendReason || '[reason]'}: ${d.extendReasonDetail || '[explain]'}. Be specific and attach-referencing (name the supporting document).
**How long I need** — until ${d.extendUntil || '[date]'}, and why that date.
**How I will support myself** — ${d.extendSupport || '[who pays]'}, CAD ${d.extendFunds || '[amount]'} available; I will not work or study in Canada on visitor status.
**My departure plan and ties** — ${d.extendDeparturePlan || '[plan]'}; family, property, work or business waiting at home.
Close by confirming I will respect the conditions of my stay and leave Canada at the end of the authorized period, then "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'pgwp') {
    return {
      system: `You draft first-person Statements of Purpose for Post-Graduation Work Permit applications (IMM 5710). You address eligibility precisely: DLI, eligible program length, full-time continuous study, application within 180 days of the completion letter, valid status. ${NO_INVENT}`,
      instruction: `Write a "Statement of Purpose" (600-900 words) addressed "Dear Visa Officer,", first person as ${name || 'the applicant'}. Sections:
**My studies in Canada** — ${d.pgwpProgram || '[program]'} (${d.pgwpLevel || '[credential]'}, ${d.pgwpProgramLength || '[n]'} months) at ${d.pgwpInstitution || '[DLI]'}, completed ${d.pgwpCompletionDate || '[date]'}; full-time throughout; tuition paid.
**My eligibility** — walk through each PGWP requirement and how it is met, citing the completion letter and transcript.
**My status** — current study permit (expires ${d.permitExpiry || '[date]'}), last entry ${d.lastEntryDate || '[date]'}, application timing.
**My work plans** — job or job offer (${d.pgwpJobOffer || '[none yet]'}), field, how it relates to my studies.
**Closing** — commitment to comply with the conditions of the permit.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'reconsideration') {
    return {
      system: `You are an experienced Canadian immigration consultant writing REQUESTS FOR RECONSIDERATION of refused temporary resident applications. You are precise, respectful and evidence-based: you quote the officer's reasons, show what the record already contained or what was misapprehended, and ask for the decision to be reopened. You cite the duty to consider evidence and procedural fairness where warranted. ${NO_INVENT}`,
      instruction: `Write a "Request for Reconsideration" letter (900-1,400 words) to the responsible IRCC office, RE: ${d.refusalAppType || '[application type]'} refused on ${d.refusalDate || '[date]'}${d.refusalAppNumber ? `, application/UCI ${d.refusalAppNumber}` : ''}, applicant ${name || '[name]'}. Structure:
**Summary of the request** — what was refused, what is being asked.
**The officer's reasons** — quote/paraphrase each stated reason.
**Why the reasons do not reflect the record** — for EACH reason: the evidence already submitted (name the document), what was overlooked or misread, and the correct conclusion. Use GCMS notes if provided.
**New or clarifying evidence** — list what is attached now.
**Request** — reopen and reconsider on the corrected record; note the intention to seek judicial review if refused, politely.
Sign as the applicant (or representative if the facts say so).

Refusal reasons (verbatim): ${d.refusalReasons || '[paste]'}
GCMS notes: ${d.gcmsNotes || '[none]'}
What went wrong: ${d.reconsiderationError || '[explain]'}
New evidence: ${d.newEvidence || '[none]'}

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'webform') {
    return {
      system: `You write concise IRCC webform messages (max ~1,500 characters) that accompany a reconsideration request or additional documents. Neutral, factual, polite. ${NO_INVENT}`,
      instruction: `Write the IRCC webform text for ${name || '[name]'} (UCI/application ${d.refusalAppNumber || d.uci || '[number]'}): state that a request for reconsideration of the ${d.refusalAppType || '[type]'} refused on ${d.refusalDate || '[date]'} is attached, summarize in 2-3 sentences what was overlooked, and list the attached documents. No headings, plain paragraphs.

Facts:
${facts}`,
    };
  }

  if (K === 'pal-exemption') {
    return {
      system: `You write short "Letter of Explanation — PAL/TAL Exemption" notes for study permit applications, in the first person, citing the applicable exemption category in plain language. ${NO_INVENT}`,
      instruction: `Write a "Letter of Explanation – Provincial Attestation Letter Exemption" (250-400 words) addressed "Dear Visa Officer,". State the program (${d.programName || '[program]'}, ${d.levelOfStudy || '[level]'}) at ${d.schoolName || '[DLI]'}, the exemption reason (${d.palExemptReason || '[reason]'}), and that no PAL/TAL is therefore required; reference the Letter of Acceptance enclosed. Close "Sincerely, ${name || '[name]'}".

Facts:
${facts}`,
    };
  }

  if (K === 'business-visit') {
    return {
      system: `You are an expert Canadian immigration consultant drafting first-person "Purpose of Travel" letters for BUSINESS VISITOR visa applications (TRV, business visitor under R187). A business visitor must not enter the Canadian labour market: no hands-on work for a Canadian employer, remuneration and the main place of business stay outside Canada. You make the business purpose concrete (who, where, what, when) and show strong ties and a return home. ${NO_INVENT}`,
      instruction: `Write an EXTENSIVE "Purpose of Travel" letter (900-1,300 words) addressed "Dear Visa Officer,", first person as ${name || 'the applicant'}. Sections:
**Introduction** — who I am, my position (${d.applicantRole || '[position]'}) at ${d.applicantCompany || '[company]'}${d.ownsBusiness ? ', which I own' : ''}, and that I am applying for a visitor visa for business.
**My company and my role** — what the company does, how long it has operated, my responsibilities and authority.
**Purpose of the business trip** — ${d.businessPurpose || '[purpose]'}; the Canadian counterpart ${d.canadianCounterpart || '[company / event]'}${d.canadianCounterpartAddress ? ` (${d.canadianCounterpartAddress})` : ''}; dates ${d.visitFrom || '[from]'} to ${d.visitTo || '[to]'}; the meetings or events planned and the expected outcome for my company.
**Business visitor, not a worker** — state plainly that I will not work for a Canadian employer or be paid from a Canadian source, and my salary and main place of business remain outside Canada.
**Financial capacity** — who pays (${d.businessWhoPays || '[payer]'}), funds available; ${BOILERPLATE.sanctionsTransfer}
**Strong ties to my home country** — the business I run or my continuing job, family, property, travel history.
**Conclusion** — commitment to leave Canada by ${d.visitTo || '[date]'}.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'business-invitation') {
    return {
      system: `You draft business invitation letters from a CANADIAN COMPANY to a foreign business visitor, for the company's authorised signatory to put on letterhead and sign. ${NO_INVENT}`,
      instruction: `Write a "Business Invitation Letter" (350-550 words) from ${d.canadianCounterpart || '[Canadian company]'}${d.canadianCounterpartAddress ? `, ${d.canadianCounterpartAddress}` : ''} to IRCC, inviting ${name || '[applicant]'} (${d.applicantRole || '[position]'}, ${d.applicantCompany || '[company]'}, passport ${d.passportNumber || '[number]'}). Cover: the relationship between the two companies; the purpose (${d.businessPurpose || '[purpose]'}); the dates (${d.visitFrom || '[from]'} to ${d.visitTo || '[to]'}) and a short schedule; who pays for travel and lodging (${d.businessWhoPays || '[payer]'}); a clear statement that the visitor will not be employed or paid by the Canadian company and will return to their employer abroad. End with a signature block: [Signatory name], [Title], company, address, phone, email, and a date line. Mark it "[To be printed on company letterhead]" at the top.

Facts:
${facts}`,
    };
  }

  if (K === 'c11') {
    return {
      system: `You are an experienced Canadian immigration consultant drafting first-person Statements of Purpose for C11 (R205(a), significant benefit) entrepreneur / self-employed work permit applications (IMM 1295, LMIA-exempt). The officer assesses: a viable business that is genuinely under way, the applicant's ownership (generally 50%+) and ability to run it, a significant economic, social or cultural benefit to Canada (jobs, investment, innovation, regional development), and that the stay is temporary or tied to an eligible path. Be concrete with figures; never promise outcomes. ${NO_INVENT}`,
      instruction: `Write an EXTENSIVE "Statement of Purpose" (1,100-1,600 words) addressed "Dear Visa Officer,", first person as ${name || 'the applicant'}. Sections:
**Introduction** — who I am and that I apply for a C11 work permit to establish and operate ${d.c11BusinessName || '[business]'}.
**My business experience** — ${d.c11HomeBusiness || '[home business]'}; my track record, roles and results.
**The Canadian business** — what it does (${d.c11Activity || '[activity]'}), location (${d.c11BusinessAddress || '[address]'}), my ownership (${d.c11Ownership || '[n]'}%), investment CAD ${d.c11Investment || '[amount]'}; the offer of employment number ${d.c11OfferNumber || '[number]'}.
**Steps already taken** — ${d.c11Progress || '[incorporation, lease, bank account, hiring…]'}; reference the enclosed evidence.
**Significant benefit to Canada** — ${d.c11Benefit || '[benefit]'}; jobs for Canadians/PRs (${d.c11Jobs || '[n]'} in the first two years), suppliers, exports, innovation, community impact.
**Why my presence in Canada is essential** — why the business cannot be run remotely.
**My plans and ties** — the home business continuing, family, and my commitment to the conditions of the permit.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'super-visa') {
    return {
      system: `You draft first-person "Purpose of Travel" letters for PARENT AND GRANDPARENT SUPER VISA applications. The officer checks: the host child/grandchild is a Canadian citizen, PR or registered Indian; the host's written promise of financial support and income at or above the LICO for the household; Canadian medical insurance of at least $100,000 valid for at least one year from entry; an immigration medical exam; and that the parent is a genuine visitor who will leave. Do not state LICO figures — refer to "the required minimum income for the household size". ${NO_INVENT}`,
      instruction: `Write an EXTENSIVE "Purpose of Travel" letter (800-1,200 words) addressed "Dear Visa Officer,", first person as ${name || 'the applicant'}. Sections:
**Introduction** — who I am and that I apply for a Super Visa to visit my ${(d.svHostRelation || '[child]').toLowerCase()} ${d.hostName || '[host]'} (${d.svHostStatus || '[status]'}).
**Purpose and length of my visits** — why we want longer visits (family, grandchildren, support), planned arrival ${d.visitFrom || '[date]'} and stay length; what I will do in Canada.
**My host's support** — ${d.hostName || '[host]'}, ${d.hostOccupation || '[occupation]'}, household of ${d.svHousehold || '[n]'} people, income CAD ${d.svHostIncome || '[amount]'} for the last tax year; the enclosed letter of invitation and promise of financial support.
**Medical insurance and exam** — insurance with ${d.svInsurer || '[insurer]'}, coverage CAD ${d.svCoverage || '[amount]'}${d.svInsuranceStart ? ` from ${d.svInsuranceStart}` : ''}, valid for at least one year from entry; medical exam ${d.svMedicalDone ? 'completed with a panel physician' : '[status]'}.
**My life and ties at home** — spouse and other family, home and property, income or pension, previous travel and compliance.
**Conclusion** — I will respect the length of stay authorized at entry and return home.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'iranian-owp') {
    return {
      system: `You draft first-person Statements of Purpose for Iranian nationals in Canada applying from inside Canada for an OPEN WORK PERMIT under a temporary public policy for Iranian nationals (IMM 5710). Public policies change: do NOT state policy names, dates, deadlines or eligibility thresholds as facts — write "[public policy name and date — confirm current version]" where a reference is needed. Focus on the applicant's lawful status, their history in Canada and why an open work permit is needed. ${NO_INVENT}`,
      instruction: `Write a "Statement of Purpose" (700-1,000 words) addressed "Dear Officer,", first person as ${name || 'the applicant'}. Sections:
**Introduction** — I am a citizen of Iran in Canada and apply for an open work permit under [public policy name and date — confirm current version].
**My status in Canada** — current status ${d.currentStatusCanada || '[status]'} expiring ${d.permitExpiry || '[date]'}, last entry ${d.lastEntryDate || '[date]'}; that I apply while in status (or on maintained status).
**My time in Canada** — what I have been doing (study, work, family), compliance with every condition.
**Why I need an open work permit** — the practical reasons, in my own words; how I will support myself and my family.
**My background and work plans** — education, experience, the work I intend to do.
**Commitment** — to respect the conditions of the permit and Canadian law.
Close with "Sincerely, ${name || '[name]'}".

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  if (K === 'invitation' && t.key === 'super-visa') {
    return {
      system: `You draft Super Visa "Letter of Invitation and Promise of Financial Support" letters, written by the child or grandchild in Canada in the first person, for the host to sign. It must contain the elements IRCC lists: a promise of financial support for the whole length of the visit, the list and number of people in the host's household, and a copy of the host's Canadian status document attached. Do not state LICO figures. ${NO_INVENT}`,
      instruction: `Write a "Letter of Invitation and Promise of Financial Support" (400-650 words) from ${d.hostName || '[host name]'} (${d.svHostStatus || d.hostStatus || '[status]'}, ${d.hostOccupation || '[occupation / employer]'}, ${d.hostAddress || '[address]'}) inviting my ${d.svHostRelation === 'Grandchild' ? 'grandparent' : 'parent'} ${name || '[applicant]'} (DOB ${d.dob || '[DOB]'}, passport ${d.passportNumber || '[number]'}). Include:
- the purpose and intended length of the visit, arrival around ${d.visitFrom || '[date]'};
- an explicit promise: "I promise to provide financial support to my ${d.svHostRelation === 'Grandchild' ? 'grandparent' : 'parent'} for the entire duration of their stay in Canada";
- my income for the last tax year (CAD ${d.svHostIncome || '[amount]'}) and that it meets the minimum required for my household;
- "My household consists of ${d.svHousehold || '[n]'} persons:" followed by a list with [name — relationship — DOB] placeholders for each;
- that my ${d.svHostStatus || '[status]'} document is enclosed, along with my NOA / T4 and employment letter;
- that the visitor holds Canadian medical insurance of at least $100,000;
- lodging with me; assurance of return.
Signature block with name, address, phone (${d.hostPhone || '[phone]'}), email (${d.hostEmail || '[email]'}) and a date line.

Facts:
${facts}`,
    };
  }

  if (K === 'invitation' && t.key === 'study-permit-child-of-worker') {
    return {
      system: `You draft invitation / support letters from a PARENT working or studying in Canada for their minor child's study permit application, for the parent to sign. ${NO_INVENT}`,
      instruction: `Write a "Letter of Invitation and Support" (350-550 words) from ${d.accompanyingParent || '[parent name]'} (${d.parentPermitType || '[permit]'} holder, valid until ${d.parentPermitExpiry || '[date]'}, ${d.parentEmployerOrSchool || '[employer / school]'}, ${d.parentAddress || '[address]'}) to IRCC about my child ${name || '[child]'} (DOB ${d.dob || '[DOB]'}). Cover: my status and employment or studies in Canada; that my child will live with me at the address above; the school (${d.schoolName || '[school]'}, grade ${d.gradeInCanada || '[grade]'}); that I will pay tuition and all living costs (income CAD ${d.parentIncome || '[amount]'} per year); ${d.travelsWith ? `the child travels with ${d.travelsWith.toLowerCase()}; ` : ''}the other parent's consent${d.otherParentName ? ` (${d.otherParentName})` : ''}; and that the child will leave Canada with the family at the end of our authorized stay. Signature block with name, address, phone, email and a date line.

Facts:
${facts}`,
    };
  }

  if (K === 'invitation') {
    return {
      system: `You draft Invitation Letters for Canadian visitor visa applications, written by the HOST in Canada in the first person, for the host to sign. ${NO_INVENT}`,
      instruction: `Write an "Invitation Letter" (400-600 words) from ${d.hostName || '[host name]'} (${d.hostStatus || '[status]'}, ${d.hostOccupation || '[occupation]'}, ${d.hostAddress || '[address]'}) to IRCC, inviting ${name || '[applicant]'} (my ${d.hostRelationship || '[relationship]'}, passport ${d.passportNumber || '[number]'}) to visit from ${d.visitFrom || '[from]'} to ${d.visitTo || '[to]'}. Cover: purpose of the visit, where the visitor will stay (${d.hostProvidesLodging ? 'with me' : '[accommodation]'}), who covers expenses (${d.visitPayer || '[payer]'}), the host's status and employment, and an assurance the visitor will return home. Include a signature block with name, address, phone (${d.hostPhone || '[phone]'}) and email (${d.hostEmail || '[email]'}) and a line for the date.

Facts:
${facts}`,
    };
  }

  if (K === 'explanation') {
    return {
      system: `You write first-person "Letters of Explanation" addressing a previous visa refusal in a new application: honest, specific, non-defensive, showing what changed. ${NO_INVENT}`,
      instruction: `Write a "Letter of Explanation" (400-700 words) addressed "Dear Visa Officer," for ${name || '[name]'}. Explain the previous refusal (${d.refusalDetails || '[details]'}), address each concern directly with the evidence now provided, and confirm what is different in this application. Close "Sincerely, ${name || '[name]'}".

Facts:
${facts}${docsNote}`,
    };
  }

  if (K === 'submission') {
    const firm = getFirm();
    const checklist = buildChecklist(d, app.type).map((c) => c.label);
    return {
      system: `You are ${firm.repName}, a Regulated Canadian Immigration Consultant (RCIC# ${firm.rcicNumber}) at ${firm.company}. You write formal, persuasive submission letters to IRCC on behalf of your client for ${t.title} applications. Honest and specific; cite the governing provisions and, where apt, Federal Court precedents. ${NO_INVENT} Refer to the client as ${p.honorific ? p.honorific + ' ' : ''}${d.familyName || '[surname]'} with pronouns ${p.subj}/${p.obj}/${p.pos}.`,
      instruction: `Write the full "Submission Letter" (1,000-1,500 words): RE line (application type, applicant name, DOB ${d.dob || '[DOB]'}, UCI ${d.uci || '-'}), introduction as RCIC, **Background**, **Purpose of the Application** (eligibility walk-through for ${t.title}), **Ties and Temporary Intent**, **Financial Support**, **Enclosed Documents** (numbered list from: ${checklist.join('; ')}), closing request, then this exact signature block:
${signatureBlock()}

Facts:
${facts}${builderNote}${docsNote}`,
    };
  }

  // Unknown kind: generic letter from facts.
  return {
    system: `You draft supporting letters for Canadian immigration applications. ${NO_INVENT}`,
    instruction: `Write "${letter.title}" for ${name || '[name]'} (${t.title}).\n\nFacts:\n${facts}${builderNote}${docsNote}`,
  };
}

/** Generate a letter's text (buffered). */
export async function generateLetter(app, key, docBlocks = []) {
  const letter = letterSpec(app, key);
  if (!letter) throw new Error(`Letter "${key}" does not apply to this application`);

  // Study-permit finance + submission letters keep their dedicated generators.
  if (app.type === 'study-permit' || app.type === 'study-permit-minor') {
    if (letter.kind === 'financial-cover') return generateFinancialCoverLetter(app);
    if (letter.kind === 'financial-summary') return generateFinancialSummary(app);
    if (letter.kind === 'submission' && app.type === 'study-permit') return generateSubmissionLetter(app);
  }
  if (letter.kind === 'financial-cover') return generateFinancialCoverLetter(app);
  if (letter.kind === 'financial-summary') return generateFinancialSummary(app);

  const { system, instruction } = buildLetterPrompt(app, letter, docBlocks.length > 0);
  const content = docBlocks.length ? [{ type: 'text', text: instruction }, ...docBlocks] : instruction;
  return complete({ system, content, maxTokens: letter.primary ? 5000 : 3000 });
}
