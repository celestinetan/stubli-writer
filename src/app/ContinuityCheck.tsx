import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { readOutline, type Book } from "./books";
import type { Character } from "./characters";
import { ignoredChecks, type Finding } from "./checks";
import { browserModel, chapterBody, checkChapter, continuityOn, countQuestions, readiness, setContinuityOn, type ContinuityFinding, type Readiness } from "./continuity";
import type { LibraryNote } from "./library";
import type { LoreEntry } from "./lore";

interface Props {
  book: Book;
  notes: LibraryNote[];
  /** The chapter being written, when it's one of this book's. */
  chapter: LibraryNote | undefined;
  cast: Character[];
  lore: LoreEntry[];
  /** The app's own reminders, so the same thing isn't listed twice. */
  reminders: Finding[];
  onOpenNote: (path: string) => void;
  onIgnore: (key: string) => void;
}

/** One chapter's check: running, finished or failed. Kept outside the screen, so closing the book doesn't stop it. */
type Run =
  | { state: "running"; text: string; done: number; total: number; stop: AbortController }
  | { state: "done"; text: string; total: number; findings: ContinuityFinding[] }
  | { state: "failed"; text: string };

const runs = new Map<string, Run>();
const watchers = new Set<() => void>();
let version = 0;
function setRun(path: string, run: Run | null) {
  if (run) runs.set(path, run);
  else runs.delete(path);
  version++;
  for (const w of watchers) w();
}
const watch = (w: () => void) => {
  watchers.add(w);
  return () => void watchers.delete(w);
};

const numberFmt = new Intl.NumberFormat();
const facts = (n: number) => `${numberFmt.format(n)} ${n === 1 ? "fact" : "facts"}`;

/** Roughly how long a check takes: a few seconds for each fact, after the chapter is read. */
function howLong(questions: number): string {
  const minutes = Math.round((15 + questions * 5) / 60);
  return minutes < 1 ? "under a minute" : minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

/**
 * Continuity check, in a book's Checks: compares the open chapter with the fixed facts on the
 * cards, using the AI model inside Chrome, on this computer. Off until the writer sets it up, in
 * three short steps. Findings are questions ("worth a look"); nothing is ever changed.
 */
export function ContinuityCheck({ book, notes, chapter, cast, lore, reminders, onOpenNote, onIgnore }: Props) {
  const model = useMemo(browserModel, []);
  const [ready, setReady] = useState<Readiness | "checking">("checking");
  const [on, setOn] = useState(continuityOn);
  const [step, setStep] = useState(0);
  const [download, setDownload] = useState<number | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  useSyncExternalStore(watch, () => version);

  useEffect(() => {
    let live = true;
    void readiness(model).then((r) => live && setReady(r));
    return () => {
      live = false;
    };
  }, [model]);

  const ignored = useMemo(() => new Set(ignoredChecks(notes.find((n) => n.path === book.path)?.text ?? "")), [notes, book.path]);
  const withFacts = [...cast, ...lore].filter((c) => c.facts.length > 0);
  const factCount = withFacts.reduce((n, c) => n + c.facts.length, 0);
  const about = useMemo(() => (chapter ? { title: chapter.title, body: chapterBody(chapter.text), toldBy: readOutline(chapter.text).toldBy } : null), [chapter]);
  const questions = useMemo(() => (about ? countQuestions(about, cast, lore) : 0), [about, cast, lore]);
  const run = chapter ? runs.get(chapter.path) : undefined;

  function turn(next: boolean) {
    setContinuityOn(next);
    setOn(next);
    setStep(0);
  }

  async function fetchModel() {
    if (!model) return;
    setDownloadFailed(false);
    setDownload(0);
    try {
      const session = await model.open("Ready.", (fraction) => setDownload(fraction));
      session.destroy();
      setReady("ready");
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownload(null);
    }
  }

  function start() {
    if (!model || !chapter || !about) return;
    const path = chapter.path;
    const text = chapter.text;
    const stop = new AbortController();
    setRun(path, { state: "running", text, done: 0, total: questions, stop });
    checkChapter(model, about, cast, lore, (p) => runs.get(path)?.state === "running" && setRun(path, { state: "running", text, ...p, stop }), stop.signal).then(
      (findings) => setRun(path, { state: "done", text, total: questions, findings }),
      () => setRun(path, stop.signal.aborted ? null : { state: "failed", text }),
    );
  }

  const title = (
    <>
      <h3 id="continuity-title">Continuity check</h3>
      <p>Compares the chapter you're writing with the fixed facts on your character and lore cards. It runs on this computer; nothing is sent anywhere.</p>
    </>
  );

  if (ready === "checking") return null;

  // Where it can't run, one quiet line says so and points to the other way.
  if (ready === "unsupported") {
    return (
      <section className="check-ai continuity" aria-labelledby="continuity-title">
        {title}
        <p className="check-small">This needs Chrome on a laptop or desktop computer. In this browser, use “Ask your own AI assistant” below.</p>
      </section>
    );
  }

  if (step > 0) {
    return (
      <section className="check-ai continuity" aria-labelledby="continuity-title">
        {title}
        <div className="setup" role="group" aria-label={`Set up the continuity check, step ${step} of 3`}>
          <p className="setup-count">Step {step} of 3</p>
          {step === 1 && (
            <>
              <h4>What it does, and what it can't</h4>
              <ul>
                <li>It reads one chapter and looks for places that say something different from a fixed fact on a card, like “Eyes: grey”.</li>
                <li>It uses a small AI model that is part of Chrome and runs on this computer. Your writing isn't sent to anyone.</li>
                <li>It can be wrong, and it can miss things. It shows you the chapter's words beside your card, and you decide.</li>
                <li>It never changes your writing or your cards.</li>
              </ul>
              <span className="connect-actions">
                <button type="button" className="primary" onClick={() => setStep(2)}>
                  Next
                </button>
                <button type="button" className="quiet" onClick={() => setStep(0)}>
                  Cancel
                </button>
              </span>
            </>
          )}
          {step === 2 && (
            <>
              <h4>This computer</h4>
              {ready === "ready" ? (
                <p>This computer is ready: Chrome already has its AI model.</p>
              ) : ready === "unavailable" ? (
                <p>
                  Chrome can't run its AI model on this computer. It needs about 22 GB of free space, and either 16 GB of memory or a recent
                  graphics chip. “Ask your own AI assistant” below works on any computer.
                </p>
              ) : (
                <>
                  <p>
                    Chrome needs to download its AI model once. It's a large download, best on Wi-Fi, and Chrome asks for about 22 GB of free
                    space. Chrome keeps the model, not Stubli Writer, and other websites can use it too.
                  </p>
                  {download !== null && (
                    <p className="setup-progress" role="status">
                      <progress value={download} max={1} aria-label="Downloading the model" /> Downloading… {Math.round(download * 100)}%
                    </p>
                  )}
                  {downloadFailed && <p role="status">The download didn't finish. Check the connection and free space, then try again.</p>}
                </>
              )}
              <span className="connect-actions">
                {ready === "ready" ? (
                  <button type="button" className="primary" onClick={() => setStep(3)}>
                    Next
                  </button>
                ) : ready !== "unavailable" ? (
                  <button type="button" className="primary" disabled={download !== null} onClick={() => void fetchModel()}>
                    Download the model
                  </button>
                ) : null}
                <button type="button" className="quiet" onClick={() => setStep(ready === "unavailable" ? 0 : 1)}>
                  {ready === "unavailable" ? "Close" : "Back"}
                </button>
              </span>
            </>
          )}
          {step === 3 && (
            <>
              <h4>Your cards</h4>
              {factCount > 0 ? (
                <p>
                  It compares fixed facts. This book has {facts(factCount)} on {withFacts.length} {withFacts.length === 1 ? "card" : "cards"}. To add
                  more, choose Edit on a character or lore card and write one on each line, like “Eyes: grey” or “Age: 34”.
                </p>
              ) : (
                <p>
                  It compares fixed facts, and this book has none yet. Under Characters or Lore, choose Edit on a card and write one on each line,
                  like “Eyes: grey” or “Age: 34”. You can turn the check on now and add them later.
                </p>
              )}
              <span className="connect-actions">
                <button type="button" className="primary" onClick={() => turn(true)}>
                  Turn on the continuity check
                </button>
                <button type="button" className="quiet" onClick={() => setStep(2)}>
                  Back
                </button>
              </span>
            </>
          )}
        </div>
      </section>
    );
  }

  if (!on) {
    return (
      <section className="check-ai continuity" aria-labelledby="continuity-title">
        {title}
        <span className="connect-actions">
          <button type="button" className="primary" onClick={() => setStep(1)}>
            Set up the continuity check
          </button>
        </span>
        <p className="check-small">Three short steps. It's off until you turn it on.</p>
      </section>
    );
  }

  // Left out: what the writer set aside, and what the reminders above already say about this chapter.
  const above = (f: ContinuityFinding) => reminders.some((r) => r.kind === "fact" && r.path === chapter?.path && r.message.startsWith(`${f.card}'s card says “${f.fact}”`));
  const shown = run?.state === "done" ? run.findings.filter((f) => !ignored.has(f.key) && !above(f)) : [];
  const stale = run && chapter && run.text !== chapter.text;
  return (
    <section className="check-ai continuity" aria-labelledby="continuity-title">
      {title}
      {ready !== "ready" ? (
        <p>Chrome's AI model isn't ready on this computer. Set it up again to download it.</p>
      ) : !chapter ? (
        <p>Open one of this book's chapters to check it.</p>
      ) : run?.state === "running" ? (
        <>
          <p className="setup-progress" role="status">
            <progress value={run.done} max={Math.max(1, run.total)} aria-label="Progress" /> Comparing {numberFmt.format(Math.min(run.done + 1, run.total))} of{" "}
            {facts(run.total)} in “{chapter.title}”…
          </p>
          <p className="check-small">You can close this and keep writing. It carries on.</p>
          <span className="connect-actions">
            <button type="button" className="quiet" onClick={() => run.stop.abort()}>
              Stop
            </button>
          </span>
        </>
      ) : (
        <>
          {run?.state === "failed" && <p role="status">The check stopped before it finished. Try again.</p>}
          {run?.state === "done" &&
            (shown.length > 0 ? (
              <>
                <h4>Worth a look in “{chapter.title}”</h4>
                <ul className="check-list continuity-list" aria-label="Worth a look">
                  {shown.map((f) => (
                    <li key={f.key} className="check-item">
                      <p className="check-message">
                        {f.card}'s card says “{f.fact}”.
                      </p>
                      <p className="check-context">Here: “{f.quote}”</p>
                      <p className="card-actions">
                        <button type="button" className="link card-open" onClick={() => onOpenNote(chapter.path)}>
                          Open “{chapter.title}”
                        </button>
                        <button type="button" className="link card-open" aria-label={`Not a problem: ${f.card}, ${f.fact}`} onClick={() => onIgnore(f.key)}>
                          Not a problem
                        </button>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p role="status">
                Nothing worth a look in “{chapter.title}”: it compared {facts(run.total)}. It can still miss things.
              </p>
            ))}
          {stale && <p className="check-small">The chapter has changed since this check.</p>}
          {questions === 0 ? (
            <p>Nothing to compare yet: this chapter names no card with fixed facts. Add some under Characters or Lore (Edit on a card).</p>
          ) : (
            <>
              <span className="connect-actions">
                <button type="button" className="primary" onClick={start}>
                  {run ? "Check again" : `Check “${chapter.title}”`}
                </button>
              </span>
              <p className="check-small">
                {facts(questions)} to compare, {howLong(questions)}.
              </p>
            </>
          )}
        </>
      )}
      <p className="check-small">It can be wrong, and it can miss things. Nothing is changed.</p>
      <p className="check-small continuity-off">
        <button type="button" className="link" onClick={() => turn(false)}>
          Turn off the continuity check
        </button>
      </p>
    </section>
  );
}
