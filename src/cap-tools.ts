import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const execFileAsync = promisify(execFile);

{
  const commonDirs =
    process.platform === "win32"
      ? []
      : ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
  const extraFromEnv = (process.env.EXTRA_PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const dirs = [
    path.dirname(process.execPath), 
    ...extraFromEnv,
    ...commonDirs,
    ...(process.env.PATH || "").split(path.delimiter),
  ].filter(Boolean);
  process.env.PATH = [...new Set(dirs)].join(path.delimiter);
}

function getProjectsRoot() {
  const root = path.resolve(
    process.env.PROJECTS_ROOT || path.join(os.homedir(), "cap-projects")
  );
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

async function runCmd(cmd: string, args: string[], cwd?: string) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      maxBuffer: 1024 * 1024 * 20,
      env: process.env,
      shell: process.platform === "win32",
    });
    return { ok: true, stdout, stderr };
  } catch (err: any) {
    return {
      ok: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
    };
  }
}

function requireEnv(names: string[]) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables in .env: ${missing.join(", ")}`
    );
  }
}

function withinRoot(resolved: string) {
  const root = getProjectsRoot();
  const rel = path.relative(root, resolved);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function assertSafePath(p: string) {
  const root = getProjectsRoot();
  const resolved = path.resolve(root, p);
  if (!withinRoot(resolved)) {
    throw new Error(
      `Refusing to operate outside the projects root (${root}). Given: ${p}`
    );
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  return resolved;
}

function assertSafeNewPath(p: string) {
  const root = getProjectsRoot();
  const resolved = path.resolve(root, p);
  if (!withinRoot(resolved)) {
    throw new Error(
      `Refusing to create anything outside the projects root (${root}). Given: ${p}`
    );
  }
  if (fs.existsSync(resolved)) {
    throw new Error(
      `${resolved} already exists. Choose a different folder name or use the existing path directly.`
    );
  }
  return resolved;
}

async function cfLogin() {
  requireEnv(["CF_API", "CF_USERNAME", "CF_PASSWORD", "CF_ORG", "CF_SPACE"]);
  const args = [
    "login",
    "-a",
    process.env.CF_API!,
    "-u",
    process.env.CF_USERNAME!,
    "-p",
    process.env.CF_PASSWORD!,
    "-o",
    process.env.CF_ORG!,
    "-s",
    process.env.CF_SPACE!,
  ];
  const result = await runCmd("cf", args);
  const pass = process.env.CF_PASSWORD!;
  const scrub = (s: string) => s.split(pass).join("********");
  return {
    ok: result.ok,
    stdout: scrub(result.stdout),
    stderr: scrub(result.stderr),
  };
}

async function cfTarget() {
  return runCmd("cf", ["target"]);
}

async function cfApps() {
  return runCmd("cf", ["apps"]);
}

async function cfAppDetails(appName: string) {
  if (!appName) throw new Error("appName is required");
  return runCmd("cf", ["app", appName]);
}

async function cfRecentLogs(appName: string, lines?: number) {
  if (!appName) throw new Error("appName is required");
  const result = await runCmd("cf", ["logs", appName, "--recent"]);
  if (result.ok && lines) {
    const allLines = result.stdout.split("\n");
    result.stdout = allLines.slice(-lines).join("\n");
  }
  return result;
}

async function cdsBuild(projectPath: string) {
  const cwd = assertSafePath(projectPath);
  return runCmd("npx", ["cds", "build", "--production"], cwd);
}

async function mbtBuild(projectPath: string) {
  const cwd = assertSafePath(projectPath);
  return runCmd("mbt", ["build"], cwd);
}

async function cfDeploy(projectPath: string, mtarRelativePath: string | undefined, confirm: boolean) {
  if (!confirm) {
    return {
      ok: false,
      stdout: "",
      stderr:
        "Deployment was NOT run. Pass confirm=true only after the user has explicitly approved this deploy in chat.",
    };
  }
  const cwd = assertSafePath(projectPath);
  const mtarPath = mtarRelativePath
    ? mtarRelativePath
    : findLatestMtar(cwd);
  if (!mtarPath) {
    throw new Error(
      "No .mtar file found. Run mbt_build first, or pass mtarRelativePath explicitly."
    );
  }
  return runCmd("cf", ["deploy", mtarPath, "-f"], cwd);
}

function findLatestMtar(cwd: string) {
  const mtaDir = path.join(cwd, "mta_archives");
  if (!fs.existsSync(mtaDir)) return null;
  const files = fs
    .readdirSync(mtaDir)
    .filter((f) => f.endsWith(".mtar"))
    .map((f) => ({
      f,
      t: fs.statSync(path.join(mtaDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join("mta_archives", files[0].f) : null;
}

async function cfPushSimple(projectPath: string, confirm: boolean) {
  if (!confirm) {
    return {
      ok: false,
      stdout: "",
      stderr:
        "Deployment was NOT run. Pass confirm=true only after the user has explicitly approved this deploy in chat.",
    };
  }
  const cwd = assertSafePath(projectPath);
  return runCmd("cf", ["push"], cwd);
}

function scrubToken(s: string) {
  const token = process.env.GITHUB_TOKEN;
  return token ? s.split(token).join("********") : s;
}

function authedRemote(repoUrl: string) {
  requireEnv(["GITHUB_TOKEN"]);
  const token = process.env.GITHUB_TOKEN;
  const httpsMatch = repoUrl.match(/^https:\/\/(.+)$/);
  if (!httpsMatch) {
    throw new Error(
      "repoUrl must be an https:// GitHub URL, e.g. https://github.com/org/repo.git"
    );
  }
  return `https://x-access-token:${token}@${httpsMatch[1]}`;
}

async function gitClone(repoUrl: string, folderName: string) {
  const dest = assertSafeNewPath(folderName);
  const remote = authedRemote(repoUrl);
  const result = await runCmd("git", ["clone", remote, dest]);
  return {
    ok: result.ok,
    stdout: scrubToken(result.stdout),
    stderr: scrubToken(result.stderr),
  };
}

async function gitInitAndCreateRemote(folderName: string, ownerOrOrg: string, repoName: string, isPrivate: boolean) {
  requireEnv(["GITHUB_TOKEN"]);
  const token = process.env.GITHUB_TOKEN;
  const dest = assertSafePath(folderName); 

  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ name: repoName, private: isPrivate !== false }),
  });
  const body = await res.json();
  if (!res.ok) {
    return { ok: false, stdout: "", stderr: `GitHub API error: ${JSON.stringify(body)}` };
  }
  const cloneUrl = body.clone_url; 
  const authorName = process.env.GIT_AUTHOR_NAME || "Claude Agent";
  const authorEmail = process.env.GIT_AUTHOR_EMAIL || "claude-agent@local";

  await runCmd("git", ["init"], dest);
  await runCmd("git", ["add", "-A"], dest);
  await runCmd(
    "git",
    ["-c", `user.name=${authorName}`, "-c", `user.email=${authorEmail}`, "commit", "-m", "Initial commit"],
    dest
  );
  await runCmd("git", ["branch", "-M", "main"], dest);
  const remote = authedRemote(cloneUrl);
  await runCmd("git", ["remote", "add", "origin", remote], dest);
  const pushResult = await runCmd("git", ["push", "-u", "origin", "main"], dest);

  return {
    ok: pushResult.ok,
    stdout: scrubToken(`Created ${body.html_url}\n${pushResult.stdout}`),
    stderr: scrubToken(pushResult.stderr),
  };
}

async function gitStatus(projectPath: string) {
  const cwd = assertSafePath(projectPath);
  return runCmd("git", ["status", "--short", "--branch"], cwd);
}

async function gitDiff(projectPath: string) {
  const cwd = assertSafePath(projectPath);
  return runCmd("git", ["diff"], cwd);
}

async function gitCommitAndPush(projectPath: string, message: string, confirm: boolean) {
  if (!confirm) {
    return {
      ok: false,
      stdout: "",
      stderr:
        "Push was NOT run. Pass confirm=true only after the user has explicitly approved pushing this commit.",
    };
  }
  const cwd = assertSafePath(projectPath);
  await runCmd("git", ["add", "-A"], cwd);
  const authorName = process.env.GIT_AUTHOR_NAME || "Claude Agent";
  const authorEmail = process.env.GIT_AUTHOR_EMAIL || "claude-agent@local";
  const commitResult = await runCmd(
    "git",
    ["-c", `user.name=${authorName}`, "-c", `user.email=${authorEmail}`, "commit", "-m", message || "Update via Claude"],
    cwd
  );
  if (!commitResult.ok && !/nothing to commit/i.test(commitResult.stdout + commitResult.stderr)) {
    return commitResult;
  }
  const remoteResult = await runCmd("git", ["remote", "get-url", "origin"], cwd);
  if (!remoteResult.ok) return remoteResult;
  const originUrl = remoteResult.stdout.trim();
  const authed = authedRemote(originUrl.replace(/^https:\/\/([^@]+@)?/, "https://"));
  const pushResult = await runCmd("git", ["push", authed], cwd);
  return {
    ok: pushResult.ok,
    stdout: scrubToken(`${commitResult.stdout}\n${pushResult.stdout}`),
    stderr: scrubToken(`${commitResult.stderr}\n${pushResult.stderr}`),
  };
}

async function cdsInit(folderName: string) {
  const dest = assertSafeNewPath(folderName);
  fs.mkdirSync(dest, { recursive: true });
  return runCmd("npx", ["-y", "cds", "init", "."], dest);
}

async function cdsAdd(projectPath: string, features: string) {
  const cwd = assertSafePath(projectPath);
  if (!features) throw new Error("features is required, e.g. 'hana,mta,xsuaa,approuter,connectivity'");
  return runCmd("npx", ["cds", "add", features], cwd);
}

async function npmInstall(projectPath: string) {
  const cwd = assertSafePath(projectPath);
  return runCmd("npm", ["install"], cwd);
}

async function githubRepoExists(fullName: string) {
  requireEnv(["GITHUB_TOKEN"]);
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 200) {
    const body = await res.json();
    return {
      ok: true,
      stdout: `EXISTS: ${body.full_name}\nDefault branch: ${body.default_branch}\nClone URL: ${body.clone_url}\nPushed at: ${body.pushed_at}`,
      stderr: "",
    };
  }
  if (res.status === 404) {
    return { ok: true, stdout: `NOT_FOUND: ${fullName} does not exist or token lacks access.`, stderr: "" };
  }
  const body = await res.text();
  return { ok: false, stdout: "", stderr: `GitHub API error (${res.status}): ${body}` };
}

async function gitSyncCheck(projectPath: string) {
  const cwd = assertSafePath(projectPath);
  const fetchResult = await runCmd("git", ["fetch", "origin"], cwd);
  if (!fetchResult.ok) return fetchResult;

  const branchResult = await runCmd("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const branch = branchResult.stdout.trim() || "main";

  const statusResult = await runCmd("git", ["status", "--short"], cwd);
  const dirty = statusResult.stdout.trim().length > 0;

  const countsResult = await runCmd(
    "git",
    ["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`],
    cwd
  );
  const [behind, ahead] = (countsResult.stdout.trim().split(/\s+/).map(Number));

  const summary = {
    branch,
    dirty,
    behindRemote: behind || 0,
    aheadOfRemote: ahead || 0,
  };
  let verdict;
  if (!dirty && summary.behindRemote === 0 && summary.aheadOfRemote === 0) {
    verdict = "IN_SYNC: local matches origin, no local changes. Nothing to pull, nothing to push.";
  } else if (summary.behindRemote > 0 && !dirty && summary.aheadOfRemote === 0) {
    verdict = "BEHIND: local is clean but behind origin — pull before editing.";
  } else if (dirty || summary.aheadOfRemote > 0) {
    verdict = "LOCAL_CHANGES: local has uncommitted or unpushed changes.";
  } else {
    verdict = "DIVERGED: local and origin have both moved — review manually.";
  }

  return {
    ok: true,
    stdout: `${verdict}\n\n${JSON.stringify(summary, null, 2)}`,
    stderr: "",
  };
}

async function diagnoseEnvironment() {
  const checks: any = {};
  for (const [label, cmd, args] of [
    ["node", process.execPath, ["--version"]],
    ["npx", "npx", ["--version"]],
    ["npm", "npm", ["--version"]],
    ["git", "git", ["--version"]],
    ["cf", "cf", ["--version"]],
    ["mbt", "mbt", ["--version"]],
  ]) {
    const result = await runCmd(cmd as string, args as string[]);
    checks[label as string] = result.ok ? result.stdout.trim() : `NOT FOUND (${result.stderr.trim()})`;
  }
  return {
    ok: true,
    stdout: [
      `platform: ${process.platform}`,
      `node execPath: ${process.execPath}`,
      `PROJECTS_ROOT: ${getProjectsRoot()}`,
      `PATH: ${process.env.PATH}`,
      "",
      "tool versions:",
      ...Object.entries(checks).map(([k, v]) => `  ${k}: ${v}`),
    ].join("\n"),
    stderr: "",
  };
}

export const CAP_TOOLS = [
  {
    name: "cf_login",
    description:
      "Log in to SAP BTP Cloud Foundry using credentials stored in the local .env file (CF_API, CF_USERNAME, CF_PASSWORD, CF_ORG, CF_SPACE). Credentials are never passed through chat.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cf_target",
    description: "Show the current Cloud Foundry org/space target and API endpoint.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cf_apps",
    description:
      "List all applications deployed in the currently targeted BTP Cloud Foundry org/space, including CAP services, approuters, etc.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cf_app_details",
    description: "Show detailed status, instances, memory, and routes for a specific deployed app.",
    inputSchema: {
      type: "object",
      properties: { appName: { type: "string", description: "Name of the deployed app" } },
      required: ["appName"],
      additionalProperties: false,
    },
  },
  {
    name: "cf_recent_logs",
    description: "Fetch recent logs for a deployed app (useful for debugging a CAP service after deploy).",
    inputSchema: {
      type: "object",
      properties: {
        appName: { type: "string" },
        lines: { type: "number", description: "Max number of trailing lines to return" },
      },
      required: ["appName"],
      additionalProperties: false,
    },
  },
  {
    name: "cds_build",
    description:
      "Run `cds build --production` in a local CAP project directory to generate deployable artifacts (db, srv, approuter modules). Run this before mbt_build.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Absolute path to the local CAP project root" },
      },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "mbt_build",
    description:
      "Run `mbt build` in a local CAP project directory to package the project into a deployable .mtar archive (in mta_archives/). Requires mta.yaml to exist (cds add mta).",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Absolute path to the local CAP project root" },
      },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "cf_deploy",
    description:
      "DEPLOY ACTION. Deploy a built .mtar to the currently targeted BTP Cloud Foundry org/space via `cf deploy`. Only call with confirm=true after the user has explicitly approved this specific deploy in the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Absolute path to the local CAP project root" },
        mtarRelativePath: {
          type: "string",
          description: "Optional relative path to the .mtar inside projectPath. If omitted, the most recent file in mta_archives/ is used.",
        },
        confirm: { type: "boolean", description: "Must be true to actually execute the deploy" },
      },
      required: ["projectPath", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "cf_push_simple",
    description:
      "DEPLOY ACTION. Run a plain `cf push` in a project directory (for simple, non-MTA apps with a manifest.yaml). Only call with confirm=true after explicit user approval.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Absolute path to the local project root" },
        confirm: { type: "boolean", description: "Must be true to actually execute the push" },
      },
      required: ["projectPath", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "cds_init",
    description:
      "Scaffold a new CAP project into a new folder under the projects root (cds init). Use this to start a brand-new app from a functional spec.",
    inputSchema: {
      type: "object",
      properties: {
        folderName: { type: "string", description: "New folder name, relative to the projects root, e.g. 'orders-app'" },
      },
      required: ["folderName"],
      additionalProperties: false,
    },
  },
  {
    name: "cds_add",
    description:
      "Add CAP features/config to an existing project, e.g. 'hana,mta,xsuaa,approuter,connectivity' to prepare it for BTP deployment.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        features: { type: "string", description: "Comma-separated feature list, e.g. 'hana,mta,xsuaa'" },
      },
      required: ["projectPath", "features"],
      additionalProperties: false,
    },
  },
  {
    name: "npm_install",
    description: "Run npm install in a project directory.",
    inputSchema: {
      type: "object",
      properties: { projectPath: { type: "string" } },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "git_clone",
    description:
      "Clone an existing GitHub repo (https URL) into a new folder under the projects root, using GITHUB_TOKEN from .env. Token is never exposed in output.",
    inputSchema: {
      type: "object",
      properties: {
        repoUrl: { type: "string", description: "e.g. https://github.com/org/orders-app.git" },
        folderName: { type: "string", description: "Destination folder name under the projects root" },
      },
      required: ["repoUrl", "folderName"],
      additionalProperties: false,
    },
  },
  {
    name: "git_init_and_create_remote",
    description:
      "For a brand-new local project (already scaffolded via cds_init): create a new GitHub repo via the GitHub API and push the initial commit to it.",
    inputSchema: {
      type: "object",
      properties: {
        folderName: { type: "string", description: "Existing local project folder under the projects root" },
        ownerOrOrg: { type: "string", description: "Not currently used directly (repo is created under the token owner's account) but kept for clarity/logging" },
        repoName: { type: "string", description: "New GitHub repo name" },
        isPrivate: { type: "boolean", description: "Defaults to true" },
      },
      required: ["folderName", "repoName"],
      additionalProperties: false,
    },
  },
  {
    name: "git_status",
    description: "Show git status for a project (what's changed, current branch).",
    inputSchema: {
      type: "object",
      properties: { projectPath: { type: "string" } },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "git_diff",
    description: "Show the current uncommitted diff for a project, so the user can review changes before pushing.",
    inputSchema: {
      type: "object",
      properties: { projectPath: { type: "string" } },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "git_commit_and_push",
    description:
      "PUSH ACTION. Commit and push changes to GitHub. Per the user's stated workflow, only call this AFTER a corresponding cf_deploy has already succeeded, and only with confirm=true after explicit user approval.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        message: { type: "string", description: "Commit message" },
        confirm: { type: "boolean" },
      },
      required: ["projectPath", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "github_repo_exists",
    description:
      "Check whether a GitHub repo exists and is accessible with the configured token. Use this FIRST when deciding whether an app is a new build or an existing one to edit.",
    inputSchema: {
      type: "object",
      properties: {
        fullName: { type: "string", description: "e.g. 'my-org/orders-app'" },
      },
      required: ["fullName"],
      additionalProperties: false,
    },
  },
  {
    name: "git_sync_check",
    description:
      "Check whether a local project folder is in sync with its GitHub remote (fetches origin, compares ahead/behind, checks for uncommitted changes). Use this before deciding whether to clone/pull or whether the local copy is already current.",
    inputSchema: {
      type: "object",
      properties: { projectPath: { type: "string" } },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "diagnose_environment",
    description:
      "Diagnostic tool: reports the platform, resolved PATH, and whether node/npx/npm/git/cf/mbt are actually reachable from this server process. Use this FIRST whenever a tool fails with ENOENT or a vague internal error, before assuming anything is broken.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export async function handleCapToolCall(name: string, args: any) {
  let result;
  switch (name) {
    case "cf_login":
      result = await cfLogin();
      break;
    case "cf_target":
      result = await cfTarget();
      break;
    case "cf_apps":
      result = await cfApps();
      break;
    case "cf_app_details":
      result = await cfAppDetails(args.appName);
      break;
    case "cf_recent_logs":
      result = await cfRecentLogs(args.appName, args.lines);
      break;
    case "cds_build":
      result = await cdsBuild(args.projectPath);
      break;
    case "mbt_build":
      result = await mbtBuild(args.projectPath);
      break;
    case "cf_deploy":
      result = await cfDeploy(args.projectPath, args.mtarRelativePath, args.confirm);
      break;
    case "cf_push_simple":
      result = await cfPushSimple(args.projectPath, args.confirm);
      break;
    case "cds_init":
      result = await cdsInit(args.folderName);
      break;
    case "cds_add":
      result = await cdsAdd(args.projectPath, args.features);
      break;
    case "npm_install":
      result = await npmInstall(args.projectPath);
      break;
    case "git_clone":
      result = await gitClone(args.repoUrl, args.folderName);
      break;
    case "git_init_and_create_remote":
      result = await gitInitAndCreateRemote(
        args.folderName,
        args.ownerOrOrg,
        args.repoName,
        args.isPrivate
      );
      break;
    case "git_status":
      result = await gitStatus(args.projectPath);
      break;
    case "git_diff":
      result = await gitDiff(args.projectPath);
      break;
    case "git_commit_and_push":
      result = await gitCommitAndPush(args.projectPath, args.message, args.confirm);
      break;
    case "github_repo_exists":
      result = await githubRepoExists(args.fullName);
      break;
    case "git_sync_check":
      result = await gitSyncCheck(args.projectPath);
      break;
    case "diagnose_environment":
      result = await diagnoseEnvironment();
      break;
    default:
      throw new Error(`Unknown CAP tool: ${name}`);
  }
  
  const text = [
    result.ok === false ? "STATUS: FAILED" : "STATUS: OK",
    result.stdout ? `--- stdout ---\n${result.stdout}` : "",
    result.stderr ? `--- stderr ---\n${result.stderr}` : "",
  ].filter(Boolean).join("\n\n");
  
  return { content: [{ type: "text", text }], isError: result.ok === false };
}
