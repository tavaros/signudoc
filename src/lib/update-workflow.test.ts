import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

// Runs the two shell steps of .github/workflows/update-signudoc.yml against
// throwaway repositories: a pretend SignuDoc with two releases, and a copy
// made the way the Vercel Deploy button makes one (a single commit holding
// the files of the first release, with none of its history). `gh` is a
// stub that answers the release questions and records the pull request.

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const workflow = readFileSync(
  path.join(repoRoot, ".github/workflows/update-signudoc.yml"),
  "utf8",
);

/** The `run: |` blocks of the workflow, in order, dedented. */
function runBlocks(): string[] {
  const lines = workflow.split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run: \|\s*$/.exec(lines[index]);

    if (!match) {
      continue;
    }

    const body: string[] = [];
    let indent: number | null = null;

    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];

      if (line.trim() === "") {
        body.push("");
        continue;
      }

      const lineIndent = line.length - line.trimStart().length;

      if (lineIndent <= match[1].length) {
        index -= 1;
        break;
      }

      indent ??= lineIndent;
      body.push(line.slice(indent));
    }

    blocks.push(body.join("\n"));
  }

  return blocks;
}

const [mergeStep, publishStep] = runBlocks();
const scratch = mkdtempSync(path.join(tmpdir(), "signudoc-update-"));

after(() => rmSync(scratch, { force: true, recursive: true }));

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_AUTHOR_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnv,
  }).trim();
}

function write(dir: string, file: string, content: string) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
}

let counter = 0;

/** A pretend SignuDoc: v0.1.0, then v0.2.0 with a migration and CI change. */
function makeUpstream() {
  const dir = path.join(scratch, `upstream-${String((counter += 1))}`);

  mkdirSync(dir);
  git(dir, "init", "--quiet", "--initial-branch=main");
  write(dir, "package.json", '{ "version": "0.1.0" }\n');
  write(dir, "src/app.ts", "export const a = 1;\nexport const b = 2;\n");
  write(dir, "db/migrations/001_init.sql", "create table t ();\n");
  write(dir, ".github/workflows/ci.yml", "name: CI\n");
  git(dir, "add", ".");
  git(dir, "commit", "--quiet", "-m", "First");
  git(dir, "tag", "v0.1.0");
  write(dir, "package.json", '{ "version": "0.2.0" }\n');
  write(dir, "src/app.ts", "export const a = 1;\nexport const b = 3;\n");
  write(dir, "db/migrations/002_more.sql", "alter table t add c int;\n");
  write(dir, ".github/workflows/ci.yml", "name: CI\non: push\n");
  git(dir, "add", ".");
  git(dir, "commit", "--quiet", "-m", "Second");
  git(dir, "tag", "v0.2.0");

  return dir;
}

/** A Deploy-button copy of v0.1.0: one commit, no shared history. */
function makeCopy(
  upstream: string,
  change?: (dir: string) => void,
  changeFirstCommit?: (dir: string) => void,
) {
  const origin = path.join(scratch, `origin-${String((counter += 1))}.git`);
  const work = path.join(scratch, `copy-${String(counter)}`);

  git(scratch, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  git(scratch, "init", "--quiet", "--initial-branch=main", work);
  execFileSync(
    "sh",
    ["-c", `git -C "${upstream}" archive v0.1.0 | tar -x -C "${work}"`],
    {
      env: gitEnv,
    },
  );
  changeFirstCommit?.(work);
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "Initial commit");

  if (change) {
    change(work);
    git(work, "add", ".");
    git(work, "commit", "--quiet", "-m", "Our change");
  }

  git(work, "remote", "add", "origin", origin);
  git(work, "push", "--quiet", "origin", "main");

  return { origin };
}

/** A fresh checkout of the copy, as actions/checkout makes one. */
function checkout(origin: string) {
  const dir = path.join(scratch, `checkout-${String((counter += 1))}`);

  git(scratch, "clone", "--quiet", origin, dir);

  return dir;
}

function makeGhStub(upstream: string) {
  const bin = path.join(scratch, `bin-${String((counter += 1))}`);
  const log = path.join(bin, "gh.log");

  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "gh"),
    `#!/usr/bin/env bash
echo "$*" >> "${log}"
release() {
  printf '{"tag_name":"%s","html_url":"https://github.com/NYLLON-SOFTWARE/SignuDoc/releases/tag/%s","body":"Notes for %s"}' "$1" "$1" "$1"
}
case "$1 $2" in
  "api repos/NYLLON-SOFTWARE/SignuDoc/releases/latest") release v0.2.0 ;;
  "api repos/NYLLON-SOFTWARE/SignuDoc/releases/tags/"*)
    tag="\${2##*/}"
    git -C "${upstream}" rev-parse -q --verify "refs/tags/$tag" > /dev/null || exit 1
    release "$tag" ;;
  "pr list") echo "" ;;
  "pr create") echo "https://github.com/acme/signudoc/pull/1" ;;
  *) echo "unexpected gh $*" >&2; exit 2 ;;
esac
`,
  );
  chmodSync(path.join(bin, "gh"), 0o755);

  return { bin, log };
}

type RunResult = {
  output: Record<string, string>;
  status: number | null;
  stderr: string;
  summary: string;
};

function runUpdate(
  dir: string,
  upstream: string,
  options: {
    basedOn?: string;
    hasToken?: boolean;
    mergeNow?: boolean;
    version?: string;
  } = {},
): RunResult & { gh: string; prBody: string } {
  const gh = makeGhStub(upstream);
  const temp = mkdtempSync(path.join(scratch, "runner-"));
  const summaryFile = path.join(temp, "summary.md");
  const outputFile = path.join(temp, "output");

  writeFileSync(summaryFile, "");
  writeFileSync(outputFile, "");

  const env = {
    ...gitEnv,
    BASE_BRANCH: "main",
    BASED_ON: options.basedOn ?? "",
    GITHUB_OUTPUT: outputFile,
    GITHUB_REPOSITORY: "acme/signudoc",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_STEP_SUMMARY: summaryFile,
    HAS_UPDATE_TOKEN: options.hasToken ? "true" : "false",
    MERGE_NOW: options.mergeNow ? "true" : "false",
    PATH: `${gh.bin}:${process.env.PATH ?? ""}`,
    REQUESTED_VERSION: options.version ?? "",
    RUNNER_TEMP: temp,
    UPSTREAM: "NYLLON-SOFTWARE/SignuDoc",
    UPSTREAM_GIT_URL: upstream,
  };
  const first = spawnSync("bash", ["-c", mergeStep], {
    cwd: dir,
    encoding: "utf8",
    env,
  });
  const output = Object.fromEntries(
    readFileSync(outputFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("=", 2) as [string, string]),
  );
  let status = first.status;
  let stderr = first.stderr;

  if (status === 0 && output.branch) {
    const second = spawnSync("bash", ["-c", publishStep], {
      cwd: dir,
      encoding: "utf8",
      env: { ...env, BRANCH: output.branch, TAG: output.tag },
    });

    status = second.status;
    stderr += second.stderr;
  }

  let ghLog = "";

  try {
    ghLog = readFileSync(gh.log, "utf8");
  } catch {
    // gh was never called.
  }

  let prBody = "";

  try {
    prBody = readFileSync(path.join(temp, "pr-body.md"), "utf8");
  } catch {
    // No pull request was prepared.
  }

  return {
    gh: ghLog,
    output,
    prBody,
    status,
    stderr,
    summary: readFileSync(summaryFile, "utf8"),
  };
}

function show(origin: string, ref: string, file: string): string {
  return git(origin, "show", `${ref}:${file}`);
}

test("a Deploy-button copy gets a pull request with the new release", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);
  const result = runUpdate(checkout(origin), upstream);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.branch, "signudoc-update/v0.2.0");
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", "src/app.ts"),
    "export const a = 1;\nexport const b = 3;",
  );
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", "db/migrations/002_more.sql"),
    "alter table t add c int;",
  );
  // The commit names the release, so the next run knows where it stands.
  assert.match(
    git(origin, "log", "-1", "--format=%B", "signudoc-update/v0.2.0"),
    new RegExp(`SignuDoc-Commit: ${git(upstream, "rev-parse", "v0.2.0")}`),
  );
  // One new commit on top of the copy, none of SignuDoc's own history.
  assert.equal(
    git(origin, "rev-list", "--count", "signudoc-update/v0.2.0"),
    "2",
  );
  assert.match(
    result.gh,
    /pr create --base main --head signudoc-update\/v0\.2\.0/,
  );
  assert.match(
    result.summary,
    /Opened https:\/\/github\.com\/acme\/signudoc\/pull\/1/,
  );
});

test("without a token, workflow files are left alone and listed", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);
  const result = runUpdate(checkout(origin), upstream);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", ".github/workflows/ci.yml"),
    "name: CI",
  );
  assert.match(
    result.prBody,
    /Workflow files not updated[\s\S]*- `\.github\/workflows\/ci\.yml`/,
  );
  assert.match(
    result.prBody,
    /Database changes[\s\S]*- `db\/migrations\/002_more\.sql`/,
  );
  assert.match(result.prBody, /Notes for v0\.2\.0/);
});

test("with a token, workflow files are updated too", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);
  const result = runUpdate(checkout(origin), upstream, { hasToken: true });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", ".github/workflows/ci.yml"),
    "name: CI\non: push",
  );
});

test("the deployer's own changes are kept", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream, (dir) => {
    write(
      dir,
      "src/app.ts",
      "// ours\nexport const a = 1;\nexport const b = 2;\n",
    );
    write(dir, "src/ours.ts", "export const ours = true;\n");
  });
  const result = runUpdate(checkout(origin), upstream);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", "src/app.ts"),
    "// ours\nexport const a = 1;\nexport const b = 3;",
  );
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", "src/ours.ts"),
    "export const ours = true;",
  );
});

test("a first commit that matches no release still finds its base", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream, undefined, (dir) => {
    write(dir, "README.md", "Our install\n");
  });
  const result = runUpdate(checkout(origin), upstream);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.summary, /Using the closest one/);
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", "README.md"),
    "Our install",
  );
  assert.equal(
    show(origin, "signudoc-update/v0.2.0", "package.json"),
    '{ "version": "0.2.0" }',
  );
});

test("a clash stops the run and names the files", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream, (dir) => {
    write(dir, "src/app.ts", "export const a = 1;\nexport const b = 99;\n");
  });
  const result = runUpdate(checkout(origin), upstream);

  assert.equal(result.status, 1);
  assert.match(result.summary, /clashes/);
  assert.match(result.summary, /- `src\/app\.ts`/);
  assert.equal(git(origin, "branch", "--list", "signudoc-update/*"), "");
});

/** Merges the pull request the way GitHub's squash button does. */
function squashMerge(origin: string, branch: string) {
  const dir = checkout(origin);
  const message = git(dir, "log", "-1", "--format=%B", `origin/${branch}`);

  git(dir, "merge", "--quiet", "--squash", `origin/${branch}`);
  git(dir, "commit", "--quiet", "-m", `Update SignuDoc (#1)\n\n* ${message}`);
  git(dir, "push", "--quiet", "origin", "main");
  // GitHub keeps the branch unless the repository deletes merged branches.
}

test("once the pull request is merged, the next run is up to date", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);

  assert.equal(runUpdate(checkout(origin), upstream).status, 0);
  squashMerge(origin, "signudoc-update/v0.2.0");

  const again = runUpdate(checkout(origin), upstream);

  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.output.branch, undefined);
  assert.match(again.summary, /Already up to date with SignuDoc v0\.2\.0/);
  // The workflow file it left alone is still pointed out.
  assert.match(again.summary, /SIGNUDOC_UPDATE_TOKEN/);
});

test("adding the token later brings in the workflow files that were left", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);

  assert.equal(runUpdate(checkout(origin), upstream).status, 0);
  squashMerge(origin, "signudoc-update/v0.2.0");

  const withToken = runUpdate(checkout(origin), upstream, { hasToken: true });

  assert.equal(withToken.status, 0, withToken.stderr);
  assert.equal(withToken.output.branch, "signudoc-update/v0.2.0-workflows");
  const branch = "signudoc-update/v0.2.0-workflows";

  assert.equal(
    show(origin, branch, ".github/workflows/ci.yml"),
    "name: CI\non: push",
  );
  assert.equal(
    git(origin, "diff", "--name-only", "main", branch),
    ".github/workflows/ci.yml",
  );

  squashMerge(origin, branch);
  const after = runUpdate(checkout(origin), upstream, { hasToken: true });

  assert.equal(after.status, 0, after.stderr);
  assert.match(after.summary, /Already up to date/);
  assert.doesNotMatch(after.summary, /SIGNUDOC_UPDATE_TOKEN/);
});

test("workflow files left behind do not block the next release", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);

  assert.equal(runUpdate(checkout(origin), upstream).status, 0);
  squashMerge(origin, "signudoc-update/v0.2.0");

  // v0.3.0 changes the same line of ci.yml that this copy never took.
  write(
    upstream,
    ".github/workflows/ci.yml",
    "name: CI\non: [push, pull_request]\n",
  );
  write(upstream, "src/app.ts", "export const a = 1;\nexport const b = 4;\n");
  git(upstream, "commit", "--quiet", "-am", "Third");
  git(upstream, "tag", "v0.3.0");

  const next = runUpdate(checkout(origin), upstream, { version: "v0.3.0" });

  assert.equal(next.status, 0, next.stderr + next.summary);
  assert.equal(
    show(origin, "signudoc-update/v0.3.0", "src/app.ts"),
    "export const a = 1;\nexport const b = 4;",
  );
  assert.equal(
    show(origin, "signudoc-update/v0.3.0", ".github/workflows/ci.yml"),
    "name: CI",
  );

  // And with the token, both releases' workflow changes arrive at once.
  squashMerge(origin, "signudoc-update/v0.3.0");
  const withToken = runUpdate(checkout(origin), upstream, {
    hasToken: true,
    version: "v0.3.0",
  });

  assert.equal(withToken.status, 0, withToken.stderr + withToken.summary);
  assert.equal(
    show(
      origin,
      "signudoc-update/v0.3.0-workflows",
      ".github/workflows/ci.yml",
    ),
    "name: CI\non: [push, pull_request]",
  );
});

test("an unclear starting point stops, and based_on settles it", () => {
  // Two SignuDoc commits equally far from the copy's edited first commit.
  const upstream = path.join(scratch, `upstream-${String((counter += 1))}`);

  mkdirSync(upstream);
  git(upstream, "init", "--quiet", "--initial-branch=main");
  write(upstream, "src/app.ts", "export const b = 1;\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "--quiet", "-m", "One");
  git(upstream, "tag", "v0.1.0");
  write(upstream, "src/app.ts", "export const b = 2;\n");
  git(upstream, "commit", "--quiet", "-am", "Two");
  write(upstream, "src/new.ts", "export const n = 1;\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "--quiet", "-m", "Three");
  git(upstream, "tag", "v0.2.0");

  const { origin } = makeCopy(upstream, undefined, (dir) => {
    write(dir, "src/app.ts", "export const b = 9;\n");
  });
  const unclear = runUpdate(checkout(origin), upstream);

  assert.equal(unclear.status, 1);
  assert.match(unclear.summary, /equally close/);

  const settled = runUpdate(checkout(origin), upstream, { basedOn: "0.1.0" });

  assert.equal(settled.status, 1);
  // From v0.1.0, SignuDoc changed the line this copy changed too.
  assert.match(settled.summary, /- `src\/app\.ts`/);

  const wrong = runUpdate(checkout(origin), upstream, { basedOn: "v9.9.9" });

  assert.equal(wrong.status, 1);
  assert.match(wrong.summary, /has no release or commit/);
});

test("a copy that is already on the latest release is up to date", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);
  const result = runUpdate(checkout(origin), upstream, { version: "0.1.0" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.summary, /Already up to date with SignuDoc v0\.1\.0/);
});

test("merge-now pushes straight to the production branch", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);
  const result = runUpdate(checkout(origin), upstream, { mergeNow: true });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(show(origin, "main", "package.json"), '{ "version": "0.2.0" }');
  assert.doesNotMatch(result.gh, /pr create/);
});

test("a version that is not a release is refused", () => {
  const upstream = makeUpstream();
  const { origin } = makeCopy(upstream);
  const result = runUpdate(checkout(origin), upstream, {
    version: "main; rm -rf /",
  });

  assert.equal(result.status, 1);
  assert.match(result.summary, /is not a release version/);
});
