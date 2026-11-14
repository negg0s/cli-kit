import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { createPrompts, createReadlinePromptIO } from "../dist/index.js";

function promptFor(...answers) {
  const questions = [];
  return {
    questions,
    prompts: createPrompts({ async ask(question) { questions.push(question); return answers.shift(); } }),
  };
}

test("text, confirmation, and choice prompts parse answers", async () => {
  const { questions, prompts } = promptFor("Ada", "YeS", "2");
  assert.equal(await prompts.text("Name?"), "Ada");
  assert.equal(await prompts.confirm("Continue?"), true);
  assert.equal(await prompts.select("Format?", [{ label: "Text", value: "text" }, { label: "JSON", value: "json" }]), "json");
  assert.match(questions[2], /Format\?[\s\S]*1\) Text[\s\S]*2\) JSON/);
});

test("prompts return undefined on EOF or cancellation and reject invalid answers", async () => {
  const eof = promptFor(undefined);
  assert.equal(await eof.prompts.text("Name?"), undefined);
  const cancel = promptFor(undefined);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await cancel.prompts.confirm("Continue?", controller.signal), undefined);
});

test("confirmation and selection fail clearly for invalid input", async () => {
  await assert.rejects(promptFor("later").prompts.confirm("Continue?"), /expected y, yes, n, or no/i);
  await assert.rejects(promptFor("3").prompts.select("Choice?", [{ label: "One", value: 1 }]), /choose a number from 1 to 1/i);
  await assert.rejects(promptFor("1").prompts.select("Choice?", []), /at least one choice/i);
});

test("readline adapter reads injected streams, handles EOF, and can be closed", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const io = createReadlinePromptIO(input, output);
  const first = io.ask("Name?");
  input.write("Ada\n");
  assert.equal(await first, "Ada");
  const second = io.ask("Again?");
  input.end();
  assert.equal(await second, undefined);
  io.close();
});

test("readline adapter releases an aborted question without consuming the next answer", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const io = createReadlinePromptIO(input, output);
  const controller = new AbortController();
  const first = io.ask("Cancelled?", controller.signal);
  controller.abort();
  assert.equal(await first, undefined);
  const second = io.ask("Next?");
  input.write("kept\n");
  assert.equal(await second, "kept");
  io.close();
});

test("readline adapter retains multiple lines from one chunk including after EOF", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = "";
  output.on("data", chunk => { written += chunk; });
  const io = createReadlinePromptIO(input, output);
  const first = io.ask("First?");
  input.end("one\ntwo\nthree\n");
  assert.equal(await first, "one");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await io.ask("Second?"), "two");
  assert.equal(await io.ask("Third?"), "three");
  assert.equal(await io.ask("EOF?"), undefined);
  assert.equal(written, "First? Second? Third? ");
  io.close();
});

test("readline adapter keeps buffered lines through cancellation and resumes for later input", async () => {
  const input = new PassThrough();
  const io = createReadlinePromptIO(input, new PassThrough());
  const first = io.ask("First?");
  input.write("one\ntwo\n");
  assert.equal(await first, "one");
  const controller = new AbortController();
  controller.abort();
  assert.equal(await io.ask("Cancelled?", controller.signal), undefined);
  assert.equal(await io.ask("Second?"), "two");
  const third = io.ask("Third?");
  input.end("three\n");
  assert.equal(await third, "three");
  io.close();
});

test("readline adapter drains already emitted lines after close", async () => {
  const input = new PassThrough();
  const io = createReadlinePromptIO(input, new PassThrough());
  input.write("one\ntwo\n");
  io.close();
  assert.equal(await io.ask("First?"), "one");
  assert.equal(await io.ask("Second?"), "two");
  assert.equal(await io.ask("Done?"), undefined);
});
