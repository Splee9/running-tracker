import { motion, type Variants } from "motion/react";
import { Link } from "../../lib/router";
import styles from "./HireFiveLines.module.css";

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const TEMPLATE = `## Hire contract — <Job name> · <STATUS>

1. Job: You own <outcome> and deliver <artifact> on <cadence>.
2. Trial: Walk the plan in text before tools / live paste.
3. Done when: (a) … (b) … (c) …
4. One key: May <reversible>. Never <send/publish/buy/delete/calendar/spend/merge> without approve.
5. Safety: When unsure, stop and ask. Auth fail → stop.

| Field | Fill |
| --- | --- |
| Owns | … |
| Inputs | … (cite live SoT paths; memory is not truth) |
| May | … |
| Must ask before | … |
| Autonomy | L? |

Probation: trial → on probation (3) → promoted after 5 clean / parked / killed.`;

function SpecTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: [string, string];
  rows: [string, string][];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{headers[0]}</th>
            <th scope="col">{headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([field, meaning]) => (
            <tr key={field}>
              <th scope="row">{field}</th>
              <td>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HireFiveLines() {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
          Build
        </motion.p>
        <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
          Hire five-line contracts
        </motion.h1>
        <motion.p className={styles.claim} variants={rise} custom={2} initial="hidden" animate="show">
          A production agent fleet needs an explicit job card before it gets autonomy. The contract
          and the probation record decide what a bot is allowed to do — not the model.
        </motion.p>
        <motion.div className={styles.lede} variants={rise} custom={3} initial="hidden" animate="show">
          <p>
            Agents fail for familiar reasons: unclear ownership, soft “done,” too many keys, and no
            stop line when something is ambiguous. The fix is not a longer system prompt. It is a
            short job card you can grade, promote, or kill.
          </p>
          <p>
            This page is the public template behind that practice. It is structure only — no private
            ops, no personal data, no dollar amounts.
          </p>
        </motion.div>
      </header>

      <section className={styles.section} aria-labelledby="five-lines">
        <h2 id="five-lines">The five lines</h2>
        <p className={styles.sectionLead}>Fill these before the first live run.</p>
        <ol className={styles.lines}>
          <li>
            <p>
              <b>Job</b> —{" "}
              <code className={styles.mono}>
                You own {"<outcome>"} and deliver {"<artifact>"} on {"<cadence>"}.
              </code>
            </p>
            <p className={styles.aside}>Hire a job, not a persona. One outcome, one owner.</p>
          </li>
          <li>
            <p>
              <b>Trial</b> —{" "}
              <code className={styles.mono}>
                Do not execute yet. Walk me through exactly what you would do
              </code>{" "}
              (tools + judgments).
            </p>
            <p className={styles.aside}>
              Prefer a short message pack: result first, sources of truth, may / may not, stop
              before the irreversible line, evidence for handoff.
            </p>
          </li>
          <li>
            <p>
              <b>Done when</b> — Checkable acceptance, not “useful” or “thorough.” Prefer citeable
              artifacts (a log path, a draft id, a receipt status).
            </p>
          </li>
          <li>
            <p>
              <b>One key</b> — Reversible work is free. Draft N. Send / publish / buy / delete /
              calendar-mutate / spend / merge = <b>0</b> without a human yes.
            </p>
          </li>
          <li>
            <p>
              <b>Safety</b> — <code className={styles.mono}>When unsure, stop and ask.</code> Auth
              fail → stop. Never invent numbers. Prefer an explicit skip over a fake ship.
            </p>
          </li>
        </ol>
        <p className={styles.gate}>
          Footer gate: <b>3 trial runs → 5 clean runs → then it works without you.</b>
        </p>
        <p className={styles.sectionLead}>
          Also state a provisional <b>autonomy level</b> (L0–L4) on the card.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="extra-fields">
        <h2 id="extra-fields">Extra fields</h2>
        <p className={styles.sectionLead}>The job description that sits under the five lines.</p>
        <SpecTable
          caption="Extra fields on a hire contract"
          headers={["Field", "Meaning"]}
          rows={[
            ["Owns", "The result this job is responsible for"],
            [
              "Inputs",
              "What it may work from (name live sources of truth; say what is not SoT)",
            ],
            ["May", "Without asking (search, read, draft, stage…)"],
            [
              "Must ask before",
              "Send, publish, purchase, delete, contact outside, money, production, calendar write, merge/deploy",
            ],
            [
              "Autonomy",
              "L0 watch → L1 prepare/stage → L2 pause before consequential → L3 scheduled with receipt → L4 coordinate other agents",
            ],
          ]}
        />
        <p className={styles.sectionLead}>
          Keep the durable role (<b>description</b>) separate from today’s assignment (
          <b>message</b>). Do not grow one giant prompt.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="probation">
        <h2 id="probation">Probation ladder</h2>
        <SpecTable
          caption="Probation status ladder"
          headers={["Status", "Meaning"]}
          rows={[
            ["Draft", "Five lines proposed; not locked"],
            ["Trial", "Contract locked; text-only walks; no live cron graded yet"],
            ["On probation", "Live paste done; next runs graded"],
            ["Promoted", "Earned authority at the stated autonomy level"],
            ["Parked", "Explicit hold; ignore until reopen"],
            ["Killed", "Closed; folded or abandoned"],
          ]}
        />
        <p className={styles.sectionLead}>
          <b>Defaults:</b> observe <b>3</b> runs on probation; promote after <b>5 clean</b> runs
          when checks pass, side effects are clear, and the approval pause has been seen working
          once. Demote if quality drops or an integration changes. Do not claim scheduled autonomy
          on a surface that is still trial-only or workspace-only.
        </p>
        <p className={styles.sectionLead}>
          Weekly review: keep / extend / kill with evidence. Drop routines nobody would miss.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="template">
        <h2 id="template">Template card</h2>
        <pre className={styles.card}>
          <code>{TEMPLATE}</code>
        </pre>
      </section>

      <section className={styles.section} aria-labelledby="example-a">
        <h2 id="example-a">Example A — Session debrief bot (generic)</h2>
        <p className={styles.sectionLead}>A post-session coach note after a planned or completed workout.</p>
        <ol className={styles.lines}>
          <li>
            <p>
              <b>Job:</b> After a planned or completed session, own the coach recap — graded fit
              line only when intent gates pass, rose/but/thorn only if real, weekly progress, what’s
              next, and one combined effort + narrative ask.
            </p>
          </li>
          <li>
            <p>
              <b>Trial:</b> Walk the note shape in text before changing recap rules or live prompts.
            </p>
          </li>
          <li>
            <p>
              <b>Done when:</b> If a session was planned or occurred in the window: omit empty
              sections; cite activity id/date; quiet only when no plan and no actual in that window;
              never invent grades; append a compose receipt (quiet | skip | compose).
            </p>
          </li>
          <li>
            <p>
              <b>One key:</b> May read workout metrics and athlete logs; post the coach note; file a
              session log when material. Never rewrite the calendar or the week plan.
            </p>
          </li>
          <li>
            <p>
              <b>Safety:</b> When fit is unclear or data conflicts, say so and stop-and-ask.
            </p>
          </li>
        </ol>
        <SpecTable
          caption="Session debrief bot job fields"
          headers={["Field", "Fill"]}
          rows={[
            ["Owns", "Post-session coach guidance note"],
            ["Inputs", "Activity metrics, fit assemble + intent gate, athlete logs, week plan"],
            ["May", "Read, draft/send recap in chat, file session log, append receipt"],
            ["Must ask before", "Calendar write, plan rewrite, spend"],
            ["Autonomy", "L3 scheduled (after promotion)"],
          ]}
        />
      </section>

      <section className={styles.section} aria-labelledby="example-b">
        <h2 id="example-b">Example B — Inbox triage bot (generic)</h2>
        <p className={styles.sectionLead}>
          Weekday inbox triage that delivers a labels-live decision board — not a prose essay.
        </p>
        <ol className={styles.lines}>
          <li>
            <p>
              <b>Job:</b> Own weekday inbox triage and deliver a decision board (Act now / Clear /
              Parked / Ready) on a standing morning and afternoon cadence.
            </p>
          </li>
          <li>
            <p>
              <b>Trial:</b> For any contract change, walk the tool plan in text first.
            </p>
          </li>
          <li>
            <p>
              <b>Done when:</b> Every unlabeled thread has a taxonomy label or an explicit skip; the
              digest is a board Spencer can act on; send/archive/trash/reply counts stay <b>0</b>{" "}
              unless a prior survey batch approved them; Ready items are staged drafts or hold
              proposals — not silent sends.
            </p>
          </li>
          <li>
            <p>
              <b>One key:</b> May apply taxonomy labels and create drafts for an allowlisted subset.
              Never send, trash, mark spam, fetch URLs from mail, or mutate the calendar from this
              job.
            </p>
          </li>
          <li>
            <p>
              <b>Safety:</b> Auth fail or ambiguous route → stop and ask. Do not fail-open.
            </p>
          </li>
        </ol>
        <SpecTable
          caption="Inbox triage bot job fields"
          headers={["Field", "Fill"]}
          rows={[
            ["Owns", "Weekday inbox state → a digest a human can act on"],
            ["Inputs", "Mail threads/labels; taxonomy / router rules; action allowlist"],
            ["May", "Search/get thread, apply taxonomy labels, create drafts for allowlisted threads"],
            ["Must ask before", "Archive, send/reply, trash, non-taxonomy labels, calendar create"],
            ["Autonomy", "L3 scheduled (after promotion)"],
          ]}
        />
      </section>

      <section className={styles.section} aria-labelledby="why">
        <h2 id="why">Why this proves the claim</h2>
        <p className={styles.sectionLead}>
          Models are interchangeable. <b>Permissions are not.</b> A fleet that skips the job card
          will invent owners, soft-pass “done,” and eventually send, spend, or merge by accident. A
          fleet that keeps the card and the probation record can promote on evidence, park on
          ambiguity, and kill duplicates — the same way a good org hires.
        </p>
        <p className={styles.sectionLead}>
          Related ideas (public craft, not endorsements): treat agents like hires with earned
          authority; keep permanent description separate from this-fire message; prefer verification
          and environment fixes over re-prompting alone.
        </p>
      </section>

      <footer className={styles.foot}>
        <p className={styles.disclaimer}>Templates and structure only. No private data.</p>
        <p className={styles.back}>
          <Link href="/">
            <span className={styles.arrow}>←</span> Projects
          </Link>
        </p>
      </footer>
    </article>
  );
}
