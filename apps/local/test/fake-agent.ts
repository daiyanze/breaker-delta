/**
 * A stand-in agent CLI for the bridge's tests. Never a real agent: it reads
 * stdin and prints an answer, and calls no model.
 *
 *   --log <file>   append one JSON line per call: argv, cwd, files in cwd, stdin length
 *   --pid <file>   write its pid there first
 *   --sleep <ms>   wait that long before answering
 *   --exit <n>     exit with that code, printing nothing
 *   --empty        print nothing
 *   --echo         print stdin back
 *
 * By default it prints the text after the last `ANSWER: ` in stdin, to the
 * end of that line: the tests' stand-in prompts put the answer there.
 * Any other argument (the tool-less flags of a real command) is ignored.
 */
import { appendFileSync, readdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const pidFile = value("--pid");
if (pidFile) writeFileSync(pidFile, String(process.pid));

const stdin = await new Response(Bun.stdin.stream()).text();

const logFile = value("--log");
if (logFile) {
  const line = {
    argv: args,
    cwd: process.cwd(),
    cwdEntries: readdirSync(process.cwd()).length,
    stdinLength: stdin.length,
  };
  appendFileSync(logFile, `${JSON.stringify(line)}\n`);
}

const sleep = value("--sleep");
if (sleep) await Bun.sleep(Number(sleep));

const exit = value("--exit");
if (exit) process.exit(Number(exit));

if (args.includes("--empty")) process.exit(0);
if (args.includes("--echo")) {
  process.stdout.write(stdin);
  process.exit(0);
}
const answers = [...stdin.matchAll(/ANSWER: (.*)$/gm)];
process.stdout.write(answers.at(-1)?.[1] ?? "");
